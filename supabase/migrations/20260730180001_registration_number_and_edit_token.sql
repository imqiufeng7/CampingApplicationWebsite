-- #10: human-friendly sequential registration number (so registrants can reference it
-- by phone instead of a UUID). bigserial is race-safe (Postgres sequence) unlike a
-- COUNT(*)-based scheme, which two concurrent submissions could both read before
-- either commits.
alter table public.registrations
  add column registration_seq bigserial;

-- #11/#12/#13: secret, unguessable token mailed to the registrant so they can review
-- their submission and correct it later without any name+ID-number style
-- authentication (which is easy to guess/impersonate).
alter table public.registrations
  add column edit_token text not null unique default encode(gen_random_bytes(24), 'hex');

-- Allow a new email_logs type for the post-submission confirmation/edit-link email
-- (previously only admin-triggered notification types existed).
alter table public.email_logs
  drop constraint if exists email_logs_type_check;
alter table public.email_logs
  add constraint email_logs_type_check
  check (type in ('審核結果', '付款通知', '場次資訊', '報到QR', '遞補通知', '報名確認'));

-- fn_submit_registration now returns the formatted registration number (text) instead
-- of the raw uuid — the uuid was only ever used for display, and every other access
-- path (review pages, edit-token flow) doesn't need the client to hold it.
drop function if exists public.fn_submit_registration(jsonb);

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
      identity_type_id, org_selected, org_other_text, fee_category_id
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
      nullif(v_member ->> 'fee_category_id', '')::uuid
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
