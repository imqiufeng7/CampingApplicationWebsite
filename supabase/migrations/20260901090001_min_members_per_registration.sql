-- Opt-in minimum member count per registration, symmetric to the existing
-- max_members_per_registration (session-wide) / max_members (per-category, when the
-- session has categories). Defaults to 1 everywhere, matching current behavior — this
-- only bites where a vendor explicitly raises it (e.g. 二林場's "至少2人以上團體" rule,
-- which the activity copy already stated but nothing had ever enforced).
alter table public.event_sessions
  add column min_members_per_registration int not null default 1
    check (min_members_per_registration >= 1)
    check (min_members_per_registration <= max_members_per_registration);

alter table public.session_registration_categories
  add column min_members int not null default 1
    check (min_members >= 1)
    check (min_members <= max_members);

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
  v_min_members int;
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

    v_min_members := v_category.min_members;
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

    v_min_members := v_session.min_members_per_registration;
    v_max_members := v_session.max_members_per_registration;
  end if;

  v_member_count := jsonb_array_length(coalesce(payload -> 'members', '[]'::jsonb));
  if v_member_count < v_min_members then
    raise exception 'at least % member(s) required for this registration', v_min_members
      using errcode = '22023';
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
      meal_diet,
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
      v_member ->> 'meal_diet',
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
