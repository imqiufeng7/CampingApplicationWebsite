-- fn_submit_registration: the ONLY way a registration is created. Runs as
-- SECURITY DEFINER (owned by the migration-running role, effectively postgres) so it
-- bypasses RLS for the multi-table write while still re-validating the session's
-- open window server-side — this is what lets an unauthenticated public form submit
-- safely without any anon INSERT policy existing on these tables at all.
--
-- Expected payload shape:
-- {
--   "session_id": "uuid",
--   "contact_email": "text",
--   "contact_phone": "text",
--   "members": [
--     {
--       "member_order": 0,
--       "name": "text",
--       "id_number": "text (plaintext, encrypted at rest here)",
--       "household_address": "text",
--       "birth_year_roc": 70,
--       "gender": "text",
--       "identity_type_id": "uuid|null",
--       "org_selected": "text|null",
--       "org_other_text": "text|null",
--       "fee_category_id": "uuid|null",
--       "files": [{"file_type": "身分證", "storage_path": "..."}]
--     }
--   ]
-- }
create or replace function public.fn_submit_registration(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_registration_id uuid;
  v_member jsonb;
  v_member_id uuid;
  v_file jsonb;
  v_member_count int;
  v_key text := private.id_number_key();
begin
  select * into v_session
  from public.event_sessions
  where id = (payload ->> 'session_id')::uuid;

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
  returning id into v_registration_id;

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
      household_address, birth_year_roc, gender,
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

  return v_registration_id;
end;
$$;

grant execute on function public.fn_submit_registration(jsonb) to anon, authenticated;

-- fn_get_registration_member_id_number: lets an authorized reviewer see the
-- decrypted ID number (needed to cross-check against uploaded ID documents). Checks
-- session access itself rather than relying on the caller having already checked,
-- since this is the only path that can ever produce plaintext.
create or replace function public.fn_get_registration_member_id_number(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_encrypted bytea;
begin
  select r.session_id, rm.id_number_encrypted
  into v_session_id, v_encrypted
  from public.registration_members rm
  join public.registrations r on r.id = rm.registration_id
  where rm.id = p_member_id;

  if not found then
    return null;
  end if;

  if not public.has_session_access(v_session_id) then
    raise exception 'not authorized to view this member' using errcode = '42501';
  end if;

  if v_encrypted is null then
    return null;
  end if;

  return pgp_sym_decrypt(v_encrypted, private.id_number_key());
end;
$$;

grant execute on function public.fn_get_registration_member_id_number(uuid) to authenticated;
