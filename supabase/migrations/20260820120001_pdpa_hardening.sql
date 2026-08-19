-- PDPA (個人資料保護法) hardening pass, scoped to what's realistic to layer onto the
-- existing schema without touching the ~90% of functionality already built:
--   1. consent_given_at — records when a registrant passed the privacy-consent gate
--      (第8/9條 notice-obligation record-keeping). Defaulting to now() covers every
--      insert path automatically since fn_submit_registration is the only writer.
--   2. admin_activity_log gains ip_address + reason, and a NEW read-access entry is
--      logged every time a plaintext ID number is actually decrypted — the existing
--      log only ever recorded writes, not views. This closes the 使用紀錄與軌跡資料
--      gap in the 個人資料檔案安全維護計畫標準 (implementing standard for 第20-1條).
--   3. A DB-counter rate limiter (private.rate_limit_events + fn_check_rate_limit),
--      no external service — wired into fn_submit_registration. Fails OPEN when the
--      caller's IP can't be determined (defense-in-depth, not the sole control; a
--      false block on a real registration day is worse than a missed abuse case).

alter table public.registrations
  add column consent_given_at timestamptz not null default now();

alter table public.admin_activity_log
  add column ip_address text,
  add column reason text;

-- Best-effort client IP from PostgREST's request.headers GUC (the standard Supabase
-- pattern for reading request headers inside a database function). Wrapped so that if
-- this GUC is ever absent/malformed, callers just get null back instead of an error —
-- IP capture is a nice-to-have for the audit trail, it must never be able to break the
-- actual registration flow.
create or replace function public.fn_client_ip()
returns text
language plpgsql
stable
as $$
declare
  v_headers json;
  v_ip text;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;

  if v_headers is null then
    return null;
  end if;

  v_ip := v_headers ->> 'x-forwarded-for';
  if v_ip is null or v_ip = '' then
    return null;
  end if;

  -- x-forwarded-for is "client, proxy1, proxy2, ..." — the first entry is the original
  -- client.
  return trim(split_part(v_ip, ',', 1));
end;
$$;

grant execute on function public.fn_client_ip() to anon, authenticated;

create table private.rate_limit_events (
  id bigserial primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index idx_rate_limit_events_bucket_created on private.rate_limit_events (bucket_key, created_at);

-- Sliding-window counter: allows p_max_count events per bucket within the last
-- p_window_seconds. A null bucket key (IP undeterminable) fails open — see the
-- file-level comment. Also opportunistically prunes its own bucket's stale rows so
-- this table never needs a separate cleanup job.
create or replace function public.fn_check_rate_limit(p_bucket_key text, p_max_count int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_bucket_key is null then
    return true;
  end if;

  delete from private.rate_limit_events
  where bucket_key = p_bucket_key and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count from private.rate_limit_events where bucket_key = p_bucket_key;

  if v_count >= p_max_count then
    return false;
  end if;

  insert into private.rate_limit_events (bucket_key) values (p_bucket_key);
  return true;
end;
$$;

grant execute on function public.fn_check_rate_limit(text, int, int) to anon, authenticated;

-- fn_submit_registration: identical to 20260731130002_submit_registration_category.sql
-- except for the rate-limit check added right after the session lookup (fails fast,
-- before any capacity locks are taken) and consent_given_at being stamped explicitly
-- for clarity (the column default already covers this, but naming it here documents
-- the intent at the actual moment of consent-gated submission).
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

-- fn_get_registration_member_id_number: identical logic to the version in
-- 20260731090002_dynamic_column_permissions.sql, minus `stable` (it now writes an
-- audit row, so it can no longer claim to be side-effect-free) plus the read-access
-- log entry itself, inserted right before the actual decrypt so a permission-denied
-- or hidden-field early return never gets logged as a successful view.
create or replace function public.fn_get_registration_member_id_number(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_registration_id uuid;
  v_registration_seq int;
  v_member_name text;
  v_encrypted bytea;
  v_admin_id uuid := auth.uid();
  v_admin_email text;
begin
  select r.session_id, r.id, r.registration_seq, rm.id_number_encrypted, rm.name
  into v_session_id, v_registration_id, v_registration_seq, v_encrypted, v_member_name
  from public.registration_members rm
  join public.registrations r on r.id = rm.registration_id
  where rm.id = p_member_id;

  if not found then
    return null;
  end if;

  if not public.has_session_access(v_session_id) then
    raise exception 'not authorized to view this member' using errcode = '42501';
  end if;

  if public.field_permission('身份證明文件') = 'hidden' then
    return null;
  end if;

  if v_encrypted is null then
    return null;
  end if;

  if v_admin_id is not null then
    select email into v_admin_email from public.admin_users where id = v_admin_id;
  end if;

  insert into public.admin_activity_log (session_id, registration_id, registration_seq, admin_user_id, admin_email, summary, ip_address)
  values (
    v_session_id,
    v_registration_id,
    v_registration_seq,
    v_admin_id,
    coalesce(v_admin_email, '未知使用者'),
    format('報名 #%s：查看成員「%s」身分證字號', v_registration_seq, v_member_name),
    public.fn_client_ip()
  );

  return pgp_sym_decrypt(v_encrypted, private.id_number_key());
end;
$$;
