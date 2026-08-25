-- Per-member 宵夜(midnight snack)/早餐(breakfast) 葷素 (meat/vegetarian) preference,
-- for catering headcount planning. Same lightweight design as the existing `gender`
-- column — plain text, no DB check constraint, validated at the Zod/app layer only
-- (z.enum(["葷", "素"])).
alter table public.registration_members
  add column midnight_snack_diet text,
  add column breakfast_diet text;

-- fn_submit_registration: identical to the version in 20260820120001_pdpa_hardening.sql
-- except the registration_members insert now also carries the two new fields.
create or replace function public.fn_submit_registration(payload jsonb)
returns table (registration_id uuid, registration_no text, edit_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_category record;
  v_has_categories boolean;
  v_registration_category_id uuid;
  v_registration_id uuid;
  v_registration_seq bigint;
  v_edit_token text;
  v_member jsonb;
  v_member_id uuid;
  v_file jsonb;
  v_member_count int;
  v_current_count int;
  v_max_members int;
  v_is_free boolean := false;
  v_key text := private.id_number_key();
begin
  if not public.fn_check_rate_limit('submit:' || coalesce(public.fn_client_ip(), 'unknown'), 10, 600) then
    raise exception 'too many submissions from this connection, please try again later' using errcode = '55000';
  end if;

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

  select exists (
    select 1 from public.session_registration_categories where session_id = v_session.id
  ) into v_has_categories;

  v_registration_category_id := nullif(payload ->> 'registration_category_id', '')::uuid;

  if v_has_categories and v_registration_category_id is null then
    raise exception 'registration_category_id is required for this session' using errcode = '22023';
  end if;

  if v_registration_category_id is not null then
    select * into v_category
    from public.session_registration_categories
    where id = v_registration_category_id and session_id = v_session.id
    for update;

    if not found then
      raise exception 'invalid registration_category_id for this session' using errcode = '22023';
    end if;

    if v_category.capacity_total is not null then
      select count(*) into v_current_count
      from public.registrations
      where registration_category_id = v_category.id and is_cancelled = false;

      if v_current_count >= v_category.capacity_total then
        raise exception 'this registration category is at capacity' using errcode = '22023';
      end if;
    end if;

    v_max_members := v_category.max_members;
    v_is_free := v_category.is_free;
  else
    if v_session.capacity_total is not null then
      select count(*) into v_current_count
      from public.registrations
      where session_id = v_session.id and is_cancelled = false;

      if v_current_count >= v_session.capacity_total then
        raise exception 'session is at capacity' using errcode = '22023';
      end if;
    end if;

    v_max_members := v_session.max_members_per_registration;
  end if;

  v_member_count := jsonb_array_length(coalesce(payload -> 'members', '[]'::jsonb));
  if v_member_count < 1 then
    raise exception 'at least one member (the contact person) is required' using errcode = '22023';
  end if;
  if v_member_count > v_max_members then
    raise exception 'member count exceeds limit of %', v_max_members
      using errcode = '22023';
  end if;

  if coalesce(payload ->> 'contact_email', '') = '' or coalesce(payload ->> 'contact_phone', '') = '' then
    raise exception 'contact_email and contact_phone are required' using errcode = '22023';
  end if;

  insert into public.registrations (session_id, registration_category_id, contact_email, contact_phone, consent_given_at)
  values (v_session.id, v_registration_category_id, payload ->> 'contact_email', payload ->> 'contact_phone', now())
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
      midnight_snack_diet, breakfast_diet,
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
      v_member ->> 'midnight_snack_diet',
      v_member ->> 'breakfast_diet',
      nullif(v_member ->> 'identity_type_id', '')::uuid,
      v_member ->> 'org_selected',
      v_member ->> 'org_other_text',
      nullif(v_member ->> 'fee_category_id', '')::uuid,
      case
        when v_is_free then '無需繳費'
        when nullif(v_member ->> 'fee_category_id', '') is null then '需繳費'
        else '審核中'
      end
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

-- fn_get_registration_for_edit: identical to 20260820130001_self_service_delete.sql's
-- version except the per-member jsonb now also includes the two new fields.
create or replace function public.fn_get_registration_for_edit(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_result jsonb;
begin
  select * into v_registration
  from public.registrations
  where edit_token = p_token;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'registration_id', v_registration.id,
    'session_id', v_registration.session_id,
    'registration_no', 'R' || lpad(v_registration.registration_seq::text, 6, '0'),
    'contact_email', v_registration.contact_email,
    'contact_phone', v_registration.contact_phone,
    'is_cancelled', v_registration.is_cancelled,
    'payment_status', v_registration.payment_status,
    'admission_status', v_registration.admission_status,
    'members', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'member_id', rm.id,
          'member_order', rm.member_order,
          'name', rm.name,
          'id_number', case when rm.id_number_encrypted is not null
            then pgp_sym_decrypt(rm.id_number_encrypted, private.id_number_key())
            else null end,
          'household_address', rm.household_address,
          'birth_year_roc', rm.birth_year_roc,
          'birth_month', rm.birth_month,
          'birth_day', rm.birth_day,
          'gender', rm.gender,
          'midnight_snack_diet', rm.midnight_snack_diet,
          'breakfast_diet', rm.breakfast_diet,
          'identity_type_id', rm.identity_type_id,
          'org_selected', rm.org_selected,
          'org_other_text', rm.org_other_text,
          'fee_category_id', rm.fee_category_id,
          'files', (
            select coalesce(jsonb_agg(
              jsonb_build_object('id', rf.id, 'file_type', rf.file_type, 'storage_path', rf.storage_path)
            ), '[]'::jsonb)
            from public.registration_files rf
            where rf.member_id = rm.id
          )
        )
        order by rm.member_order
      ), '[]'::jsonb)
      from public.registration_members rm
      where rm.registration_id = v_registration.id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- fn_update_registration_via_token: identical to 20260730180002_edit_token_functions.sql
-- except the per-member update now also carries the two new fields.
create or replace function public.fn_update_registration_via_token(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_session record;
  v_member jsonb;
  v_member_id uuid;
  v_file jsonb;
  v_key text := private.id_number_key();
begin
  select * into v_registration
  from public.registrations
  where edit_token = p_token
  for update;

  if not found then
    raise exception 'invalid edit token' using errcode = '42501';
  end if;

  if v_registration.is_cancelled then
    raise exception 'this registration has been cancelled' using errcode = '22023';
  end if;

  select * into v_session from public.event_sessions where id = v_registration.session_id;

  update public.registrations
  set contact_email = coalesce(payload ->> 'contact_email', contact_email),
      contact_phone = coalesce(payload ->> 'contact_phone', contact_phone)
  where id = v_registration.id;

  for v_member in select * from jsonb_array_elements(coalesce(payload -> 'members', '[]'::jsonb))
  loop
    select id into v_member_id
    from public.registration_members
    where registration_id = v_registration.id
      and member_order = coalesce((v_member ->> 'member_order')::int, -1);

    if v_member_id is null then
      continue; -- silently skip unknown member_order rather than allow inserting new members
    end if;

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

    update public.registration_members
    set name = coalesce(v_member ->> 'name', name),
        id_number_encrypted = case when v_member ->> 'id_number' is not null
          then pgp_sym_encrypt(v_member ->> 'id_number', v_key)
          else id_number_encrypted end,
        id_number_hash = case when v_member ->> 'id_number' is not null
          then encode(hmac(v_member ->> 'id_number', v_key, 'sha256'), 'hex')
          else id_number_hash end,
        household_address = coalesce(v_member ->> 'household_address', household_address),
        birth_year_roc = coalesce(nullif(v_member ->> 'birth_year_roc', '')::int, birth_year_roc),
        birth_month = coalesce(nullif(v_member ->> 'birth_month', '')::int, birth_month),
        birth_day = coalesce(nullif(v_member ->> 'birth_day', '')::int, birth_day),
        gender = coalesce(v_member ->> 'gender', gender),
        midnight_snack_diet = coalesce(v_member ->> 'midnight_snack_diet', midnight_snack_diet),
        breakfast_diet = coalesce(v_member ->> 'breakfast_diet', breakfast_diet),
        identity_type_id = coalesce(nullif(v_member ->> 'identity_type_id', '')::uuid, identity_type_id),
        org_selected = case when v_member ? 'org_selected' then v_member ->> 'org_selected' else org_selected end,
        org_other_text = case when v_member ? 'org_other_text' then v_member ->> 'org_other_text' else org_other_text end,
        fee_category_id = case when v_member ? 'fee_category_id'
          then nullif(v_member ->> 'fee_category_id', '')::uuid
          else fee_category_id end
    where id = v_member_id;

    -- Files: replace any existing rows of the same file_type for this member (a
    -- re-upload overwrites, it doesn't accumulate duplicates).
    if v_member ? 'files' then
      for v_file in select * from jsonb_array_elements(v_member -> 'files')
      loop
        delete from public.registration_files
        where member_id = v_member_id and file_type = v_file ->> 'file_type';

        insert into public.registration_files (registration_id, member_id, file_type, storage_path)
        values (v_registration.id, v_member_id, v_file ->> 'file_type', v_file ->> 'storage_path');
      end loop;
    end if;
  end loop;
end;
$$;
