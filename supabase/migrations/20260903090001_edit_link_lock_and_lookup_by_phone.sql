-- Vendor correction: the edit link must NOT be freely usable at any point by default
-- (not pre-review, not during, not after) — every registration starts locked, and
-- editing is only ever granted one use at a time, at the moment staff actually decide
-- it's needed (退回補件 notice going out, or a manual "允許再修改一次" for something
-- like a late member swap near the event). 0 means locked; a positive count is
-- consumed by fn_update_registration_via_token on each successful save.
alter table public.registrations
  add column remaining_self_edits int not null default 0 check (remaining_self_edits >= 0);

-- remaining_self_edits is an administrative/operational toggle, not part of any of the
-- 7 PII field groups — grouped with admin_note/duplicate_flag under 備註.
create or replace function public.enforce_registrations_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text := public.current_admin_role();
  ignored_cols text[] := array['id', 'updated_at'];
  col text;
  field_group text;
begin
  if admin_role is null or admin_role = 'vendor' then
    return new;
  end if;

  for col in select key from jsonb_each(to_jsonb(new)) loop
    if col = any(ignored_cols) then
      continue;
    end if;
    if (to_jsonb(old) ->> col) is distinct from (to_jsonb(new) ->> col) then
      field_group := case col
        when 'review_status' then '錄取分組結果'
        when 'admission_status' then '錄取分組結果'
        when 'waitlist_rank' then '錄取分組結果'
        when 'group_zone' then '錄取分組結果'
        when 'group_number' then '錄取分組結果'
        when 'tent_type' then '錄取分組結果'
        when 'sleeping_bag_own_qty' then '錄取分組結果'
        when 'sleeping_bag_rent_qty' then '錄取分組結果'
        when 'is_cancelled' then '取消退費資訊'
        when 'cancelled_at' then '取消退費資訊'
        when 'cancel_reason' then '取消退費資訊'
        when 'refund_amount' then '取消退費資訊'
        when 'refund_status' then '取消退費資訊'
        when 'duplicate_flag' then '備註'
        when 'duplicate_note' then '備註'
        when 'admin_note' then '備註'
        when 'remaining_self_edits' then '備註'
        when 'payment_status' then '繳費狀態'
        when 'payment_amount' then '繳費狀態'
        when 'payment_method' then '繳費狀態'
        when 'ecpay_trade_no' then '繳費狀態'
        when 'ecpay_link' then '繳費狀態'
        when 'ecpay_merchant_trade_no' then '繳費狀態'
        when 'manual_transfer_last5' then '繳費狀態'
        when 'manual_transfer_note' then '繳費狀態'
        else null
      end;

      if field_group is null or public.field_permission(field_group) is distinct from 'editable' then
        raise exception 'role % is not permitted to modify column %', admin_role, col
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

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
    'remaining_self_edits', v_registration.remaining_self_edits,
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
          'meal_diet', rm.meal_diet,
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

  if v_registration.remaining_self_edits <= 0 then
    raise exception 'this registration is not currently open for self-editing, please contact the organizer'
      using errcode = '42501';
  end if;

  select * into v_session from public.event_sessions where id = v_registration.session_id;

  update public.registrations
  set contact_email = coalesce(payload ->> 'contact_email', contact_email),
      contact_phone = coalesce(payload ->> 'contact_phone', contact_phone),
      remaining_self_edits = remaining_self_edits - 1
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

-- New editable email type: sent whenever staff grant a one-time edit window (either
-- the existing 退回補件 flow, or the new manual "允許再修改一次" action) so the
-- registrant actually has the link in hand — this is the moment the link becomes real,
-- since the registration starts locked and there's no other way to learn about it.
alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates add constraint email_templates_type_check
  check (type in (
    '報名確認', '審核結果', '審核結果-正取', '審核結果-備取', '退回補件', '開放修改', '管理員邀請'
  ));

alter table public.session_email_templates drop constraint session_email_templates_type_check;
alter table public.session_email_templates add constraint session_email_templates_type_check
  check (type in (
    '報名確認', '審核結果', '審核結果-正取', '審核結果-備取', '退回補件', '開放修改'
  ));

insert into public.email_templates (type, subject_template, body_template) values
(
  '開放修改',
  '【{{活動名稱}}】您的報名資料已開放修改（編號 {{報名編號}}）',
  '您好，

主辦單位已重新開放您報名資料的修改權限，請於下方連結完成修改（僅能存檔一次，存檔後連結將再次關閉）：
{{修改連結}}

{{開放原因}}

如有任何疑問，請洽詢主辦單位。
'
)
on conflict (type) do nothing;

-- registration_no is a small, sequential number the registrant has to dig out of a
-- confirmation email — the organizer would rather they look up with something they
-- always remember (their phone number) than risk them not finding it at all. Email
-- alone isn't a safe-enough credential pair on its own (someone could guess/brute-force
-- a phone number range far more easily than a global sequence number, but phone
-- numbers aren't sequential/enumerable the way registration_no was, and this is still
-- rate-limited the same way), so both together.
--
-- Unlike registration_no (a single globally-unique sequence), the same email+phone can
-- legitimately match more than one registration (e.g. one family registering for two
-- different sessions), so this returns a JSON array instead of a single object.
drop function if exists public.fn_lookup_registration_result(text, text);

create or replace function public.fn_lookup_registration_results(p_email text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_session record;
  v_published boolean;
  v_review_status text;
  v_admission_status text;
  v_waitlist_rank int;
  v_payment_status text;
  v_payment_amount numeric;
  v_payment_method text;
  v_payment_deadline timestamptz;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.fn_check_rate_limit('lookup:' || coalesce(public.fn_client_ip(), 'unknown'), 20, 600) then
    raise exception 'too many lookup attempts, please try again later' using errcode = '55000';
  end if;

  if coalesce(p_email, '') = '' or coalesce(p_phone, '') = '' then
    return v_results;
  end if;

  for v_registration in
    select r.* from public.registrations r
    where lower(r.contact_email) = lower(p_email)
      and r.contact_phone = p_phone
      and r.is_cancelled = false
    order by r.submitted_at asc
  loop
    select * into v_session from public.event_sessions where id = v_registration.session_id;

    v_published := v_registration.result_published_at is not null;
    if v_published or v_registration.review_status = '退回補件' then
      v_review_status := v_registration.review_status;
      v_admission_status := v_registration.admission_status;
      v_waitlist_rank := v_registration.waitlist_rank;
      v_payment_status := v_registration.payment_status;
      v_payment_amount := v_registration.payment_amount;
      v_payment_method := v_registration.payment_method;
      v_payment_deadline := v_registration.payment_deadline;
    else
      v_review_status := '審核中';
      v_admission_status := '待確認';
      v_waitlist_rank := null;
      v_payment_status := '無需繳費';
      v_payment_amount := 0;
      v_payment_method := null;
      v_payment_deadline := null;
    end if;

    v_results := v_results || jsonb_build_object(
      'registration_id', v_registration.id,
      'registration_no', 'R' || lpad(v_registration.registration_seq::text, 6, '0'),
      'session_name', v_session.name,
      'session_date_start', v_session.date_start,
      'session_date_end', v_session.date_end,
      'result_announce_at', v_session.result_announce_at,
      'fee_discount_per_person', v_session.fee_discount_per_person,
      'review_status', v_review_status,
      'admission_status', v_admission_status,
      'waitlist_rank', v_waitlist_rank,
      'payment_status', v_payment_status,
      'payment_amount', v_payment_amount,
      'payment_method', v_payment_method,
      'payment_deadline', v_payment_deadline,
      'members', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'name', rm.name,
            'fee_review_result', case when v_published then rm.fee_review_result else '審核中' end,
            'fee_category_label', case
              when not v_published then null
              when sfc.id is null then null
              when sfc.code is not null then sfc.code || ' ' || sfc.label
              else sfc.label
            end
          )
          order by rm.member_order
        ), '[]'::jsonb)
        from public.registration_members rm
        left join public.session_fee_categories sfc on sfc.id = rm.fee_category_id
        where rm.registration_id = v_registration.id
      )
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function public.fn_lookup_registration_results(text, text) to anon, authenticated;
