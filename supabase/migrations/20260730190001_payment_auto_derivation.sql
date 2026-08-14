-- #20: derives registrations.payment_status/payment_amount/payment_method from the
-- members' fee_review_result instead of requiring finance to type them in by hand —
-- confirmed formula: amount = (members whose fee_review_result <> '無需繳費') ×
-- event_sessions.fee_discount_per_person (which the client uses as the flat per-person
-- registration fee, not literally a "discount"), regardless of the session's member
-- cap. Recomputes whenever a member's fee_review_result changes; never touches a
-- registration once finance has marked it '已完成', so a late review edit can't
-- silently reopen a settled payment.

-- The column-permission trigger on registrations (see
-- *_column_permission_triggers.sql) would otherwise reject this recompute trigger's
-- own UPDATE, because it runs under the reviewing host_org's role, which isn't
-- allowed to touch payment_* columns directly. A transaction-local flag lets this one
-- trusted internal trigger bypass that check without weakening it for anyone else.
create or replace function public.enforce_registrations_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text := public.current_admin_role();
  host_org_cols text[] := array[
    'review_status', 'admission_status', 'waitlist_rank',
    'group_zone', 'group_number', 'tent_type',
    'sleeping_bag_own_qty', 'sleeping_bag_rent_qty',
    'is_cancelled', 'cancelled_at', 'cancel_reason',
    'refund_amount', 'refund_status',
    'duplicate_flag', 'duplicate_note',
    'checkin_at', 'checkin_by',
    'admin_note'
  ];
  finance_cols text[] := array[
    'payment_status', 'payment_amount', 'payment_method',
    'ecpay_trade_no', 'ecpay_link',
    'manual_transfer_last5', 'manual_transfer_note'
  ];
  allowed_cols text[];
  ignored_cols text[] := array['id', 'updated_at'];
  col text;
begin
  if current_setting('app.bypass_column_check', true) = 'true' then
    return new;
  end if;

  if admin_role is null or admin_role = 'vendor' then
    return new;
  elsif admin_role = 'host_org' then
    allowed_cols := host_org_cols;
  elsif admin_role = 'finance' then
    allowed_cols := finance_cols;
  else
    allowed_cols := array[]::text[];
  end if;

  for col in select key from jsonb_each(to_jsonb(new)) loop
    if col = any(ignored_cols) then
      continue;
    end if;
    if (to_jsonb(old) ->> col) is distinct from (to_jsonb(new) ->> col) then
      if not (col = any(allowed_cols)) then
        raise exception 'role % is not permitted to modify column %', admin_role, col
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.fn_recompute_registration_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
  v_session_id uuid;
  v_current_status text;
  v_paying_count int;
  v_unit_fee numeric;
begin
  v_registration_id := coalesce(new.registration_id, old.registration_id);

  select session_id, payment_status into v_session_id, v_current_status
  from public.registrations
  where id = v_registration_id
  for update;

  -- Once finance has confirmed payment, a later review edit must not silently reopen
  -- or resize an already-settled charge.
  if v_current_status = '已完成' then
    return coalesce(new, old);
  end if;

  select fee_discount_per_person into v_unit_fee
  from public.event_sessions
  where id = v_session_id;

  select count(*) into v_paying_count
  from public.registration_members
  where registration_id = v_registration_id
    and fee_review_result <> '無需繳費';

  perform set_config('app.bypass_column_check', 'true', true);

  if v_paying_count = 0 then
    update public.registrations
    set payment_status = '無需繳費', payment_amount = 0, payment_method = null
    where id = v_registration_id;
  else
    update public.registrations
    set payment_status = '待繳費',
        payment_amount = v_paying_count * coalesce(v_unit_fee, 0),
        payment_method = coalesce(payment_method, 'online')
    where id = v_registration_id;
  end if;

  perform set_config('app.bypass_column_check', 'false', true);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_registration_payment on public.registration_members;
create trigger trg_recompute_registration_payment
  after insert or update of fee_review_result or delete on public.registration_members
  for each row
  execute function public.fn_recompute_registration_payment();

-- A member who never applied for any fee waiver has nothing to review — default them
-- straight to '需繳費' instead of leaving them stuck at '審核中' forever (which would
-- have meant they never counted toward payment_amount above).
create or replace function public.fn_submit_registration(payload jsonb)
returns table (registration_id uuid, registration_no text, edit_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_registration_id uuid;
  v_registration_seq bigint;
  v_edit_token text;
  v_member jsonb;
  v_member_id uuid;
  v_file jsonb;
  v_member_count int;
  v_current_count int;
  v_key text := private.id_number_key();
begin
  select * into v_session
  from public.event_sessions
  where id = (payload ->> 'session_id')::uuid
  for update;

  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if v_session.status <> 'open' then
    raise exception 'session is not open for registration' using errcode = '22023';
  end if;

  if v_session.registration_open_at is not null and now() < v_session.registration_open_at then
    raise exception 'registration has not opened yet' using errcode = '22023';
  end if;

  if v_session.registration_close_at is not null and now() > v_session.registration_close_at then
    raise exception 'registration is closed' using errcode = '22023';
  end if;

  if v_session.capacity_total is not null then
    select count(*) into v_current_count
    from public.registrations
    where session_id = v_session.id and is_cancelled = false;

    if v_current_count >= v_session.capacity_total then
      raise exception 'session is at capacity' using errcode = '22023';
    end if;
  end if;

  v_member_count := jsonb_array_length(coalesce(payload -> 'members', '[]'::jsonb));
  if v_member_count < 1 then
    raise exception 'at least one member (the contact person) is required' using errcode = '22023';
  end if;
  if v_member_count > v_session.max_members_per_registration then
    raise exception 'member count exceeds session limit of %', v_session.max_members_per_registration
      using errcode = '22023';
  end if;

  if coalesce(payload ->> 'contact_email', '') = '' or coalesce(payload ->> 'contact_phone', '') = '' then
    raise exception 'contact_email and contact_phone are required' using errcode = '22023';
  end if;

  insert into public.registrations (session_id, contact_email, contact_phone)
  values (v_session.id, payload ->> 'contact_email', payload ->> 'contact_phone')
  returning id, registrations.registration_seq, registrations.edit_token
    into v_registration_id, v_registration_seq, v_edit_token;

  for v_member in select * from jsonb_array_elements(payload -> 'members')
  loop
    if (v_member ->> 'identity_type_id') is not null and not exists (
      select 1 from public.session_identity_types sit
      where sit.id = (v_member ->> 'identity_type_id')::uuid and sit.session_id = v_session.id
    ) then
      raise exception 'invalid identity_type_id for this session' using errcode = '22023';
    end if;

    if (v_member ->> 'fee_category_id') is not null and not exists (
      select 1 from public.session_fee_categories sfc
      where sfc.id = (v_member ->> 'fee_category_id')::uuid and sfc.session_id = v_session.id
    ) then
      raise exception 'invalid fee_category_id for this session' using errcode = '22023';
    end if;

    insert into public.registration_members (
      registration_id, member_order, name,
      id_number_encrypted, id_number_hash,
      household_address, birth_year_roc, birth_month, birth_day, gender,
      identity_type_id, org_selected, org_other_text, fee_category_id,
      fee_review_result
    )
    values (
      v_registration_id,
      coalesce((v_member ->> 'member_order')::int, 0),
      v_member ->> 'name',
      case when v_member ->> 'id_number' is not null
        then pgp_sym_encrypt(v_member ->> 'id_number', v_key)
        else null end,
      case when v_member ->> 'id_number' is not null
        then encode(hmac(v_member ->> 'id_number', v_key, 'sha256'), 'hex')
        else null end,
      v_member ->> 'household_address',
      nullif(v_member ->> 'birth_year_roc', '')::int,
      nullif(v_member ->> 'birth_month', '')::int,
      nullif(v_member ->> 'birth_day', '')::int,
      v_member ->> 'gender',
      nullif(v_member ->> 'identity_type_id', '')::uuid,
      v_member ->> 'org_selected',
      v_member ->> 'org_other_text',
      nullif(v_member ->> 'fee_category_id', '')::uuid,
      case when nullif(v_member ->> 'fee_category_id', '') is null then '需繳費' else '審核中' end
    )
    returning id into v_member_id;

    for v_file in select * from jsonb_array_elements(coalesce(v_member -> 'files', '[]'::jsonb))
    loop
      insert into public.registration_files (registration_id, member_id, file_type, storage_path)
      values (v_registration_id, v_member_id, v_file ->> 'file_type', v_file ->> 'storage_path');
    end loop;
  end loop;

  return query select v_registration_id, 'R' || lpad(v_registration_seq::text, 6, '0'), v_edit_token;
end;
$$;

grant execute on function public.fn_submit_registration(jsonb) to anon, authenticated;
