-- #12/#13: lets a registrant correct their own submission (fix a typo, re-upload a
-- bad document scan) via the secret edit_token mailed to them at submission time —
-- no name+ID-number auth, which is trivially guessable/impersonable. Scoped narrowly:
-- can edit existing members' fields and file uploads, cannot add/remove members or
-- change which session the registration belongs to.

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

grant execute on function public.fn_get_registration_for_edit(text) to anon, authenticated;

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

grant execute on function public.fn_update_registration_via_token(text, jsonb) to anon, authenticated;
