-- Registrants previously could not add a member through their self-edit link at
-- all — fn_update_registration_via_token matched incoming member payloads only by
-- an existing member_order and silently dropped anything that didn't match ("continue
-- ... rather than allow inserting new members"), and EditRegistrationForm capped its
-- own zod schema's maxMembers at data.members.length, so the UI never even offered
-- an "add member" button. That forced anyone who needed to add a person after
-- submitting to fill out an entirely new registration instead of extending their
-- existing one. This now allows adding members up to the session/category's normal
-- max_members cap — the exact same limit new registrations are held to.
create or replace function public.fn_update_registration_via_token(p_token text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_session record;
  v_category record;
  v_max_members int;
  v_is_free boolean := false;
  v_current_member_count int;
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

  if v_registration.remaining_self_edits <= 0 then
    raise exception 'this registration is not currently open for self-editing, please contact the organizer'
      using errcode = '42501';
  end if;

  select * into v_session from public.event_sessions where id = v_registration.session_id;

  if v_registration.registration_category_id is not null then
    select * into v_category
    from public.session_registration_categories
    where id = v_registration.registration_category_id;
    v_max_members := coalesce(v_category.max_members, v_session.max_members_per_registration);
    v_is_free := coalesce(v_category.is_free, false);
  else
    v_max_members := v_session.max_members_per_registration;
  end if;

  select count(*) into v_current_member_count
  from public.registration_members
  where registration_id = v_registration.id;

  update public.registrations
  set contact_email = coalesce(payload ->> 'contact_email', contact_email),
      contact_phone = coalesce(payload ->> 'contact_phone', contact_phone),
      comfort_bed_needed = coalesce(nullif(payload ->> 'comfort_bed_needed', ''), comfort_bed_needed),
      remaining_self_edits = remaining_self_edits - 1
  where id = v_registration.id;

  for v_member in select * from jsonb_array_elements(coalesce(payload -> 'members', '[]'::jsonb))
  loop
    select id into v_member_id
    from public.registration_members
    where registration_id = v_registration.id
      and member_order = coalesce((v_member ->> 'member_order')::int, -1);

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

    if v_member_id is null then
      -- A member_order the registration doesn't have yet — the registrant added a
      -- new person in this save. Capped at the same max_members the original
      -- registration was held to; extras beyond that are silently ignored (the
      -- client already enforces this via the same maxMembers-bound zod schema, this
      -- is defense-in-depth against a direct RPC call).
      if v_current_member_count >= v_max_members then
        continue;
      end if;

      insert into public.registration_members (
        registration_id, member_order, name,
        id_number_encrypted, id_number_hash,
        household_address, birth_year_roc, birth_month, birth_day, gender,
        meal_diet,
        identity_type_id, org_selected, org_other_text, fee_category_id,
        fee_review_result
      )
      values (
        v_registration.id,
        coalesce((v_member ->> 'member_order')::int, v_current_member_count),
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
        v_member ->> 'meal_diet',
        nullif(v_member ->> 'identity_type_id', '')::uuid,
        v_member ->> 'org_selected',
        v_member ->> 'org_other_text',
        nullif(v_member ->> 'fee_category_id', '')::uuid,
        -- Overwritten by trg_compute_member_fee_review_result on insert (which
        -- already knows how to handle a 整組免費 category vs. a per-member fee
        -- category vs. neither) — this initial value only matters if that trigger
        -- is ever missing.
        case when v_is_free then '無需繳費' when nullif(v_member ->> 'fee_category_id', '') is null then '需繳費' else '審核中' end
      )
      returning id into v_member_id;

      v_current_member_count := v_current_member_count + 1;

      if v_member ? 'files' then
        for v_file in select * from jsonb_array_elements(coalesce(v_member -> 'files', '[]'::jsonb))
        loop
          insert into public.registration_files (registration_id, member_id, file_type, storage_path)
          values (v_registration.id, v_member_id, v_file ->> 'file_type', v_file ->> 'storage_path');
        end loop;
      end if;

      continue;
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
        meal_diet = coalesce(v_member ->> 'meal_diet', meal_diet),
        identity_type_id = coalesce(nullif(v_member ->> 'identity_type_id', '')::uuid, identity_type_id),
        org_selected = case when v_member ? 'org_selected' then v_member ->> 'org_selected' else org_selected end,
        org_other_text = case when v_member ? 'org_other_text' then v_member ->> 'org_other_text' else org_other_text end,
        fee_category_id = case when v_member ? 'fee_category_id'
          then nullif(v_member ->> 'fee_category_id', '')::uuid
          else fee_category_id end
    where id = v_member_id;

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
