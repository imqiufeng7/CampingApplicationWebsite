-- Batch of admin-console fixes requested after the vendor's first round of client
-- testing: rename the default admission status, make F6-style auto-approve fire
-- immediately (not gated on admission), add a 退回補件 (needs-resubmission) email
-- type + reason field, and a lightweight per-session activity log so multiple admins
-- can see who changed what and when.

-- ---------------------------------------------------------------------------
-- 1. admission_status: rename "未抽籤" (not yet drawn) to "待確認" (pending
-- confirmation) — clearer to reviewers. "備取" (waitlisted) stays its own distinct
-- state; this is a pure rename, not a merge.
-- ---------------------------------------------------------------------------
alter table public.registrations drop constraint registrations_admission_status_check;
alter table public.registrations
  add constraint registrations_admission_status_check
  check (admission_status in ('未抽籤', '待確認', '正取', '備取', '取消'));

update public.registrations set admission_status = '待確認' where admission_status = '未抽籤';

alter table public.registrations drop constraint registrations_admission_status_check;
alter table public.registrations
  add constraint registrations_admission_status_check
  check (admission_status in ('待確認', '正取', '備取', '取消'));
alter table public.registrations alter column admission_status set default '待確認';

-- ---------------------------------------------------------------------------
-- 2. Fee-category auto-approve (自備睡袋(墊) / any auto_approve category): fire as
-- soon as the member picks the category, not only after admission — there's nothing
-- to verify for these categories, so making the registrant wait until 正取 was an
-- unnecessary delay. Admission status is unrelated and stays untouched by this.
-- Target value also changes from 無需繳費 to 審核通過 (matches the reviewer-facing
-- wording requested) — functionally identical for payment purposes, since
-- fn_recompute_registration_payment already treats 審核通過 and 無需繳費 the same way.
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_approve_fee_categories(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.bypass_column_check', 'true', true);

  update public.registration_members rm
  set fee_review_result = '審核通過'
  from public.session_fee_categories sfc
  where rm.registration_id = p_registration_id
    and rm.fee_category_id = sfc.id
    and sfc.auto_approve = true
    and rm.fee_review_result = '審核中';

  perform set_config('app.bypass_column_check', 'false', true);
end;
$$;

create or replace function public.trg_fn_auto_approve_on_fee_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_auto_approve_fee_categories(new.registration_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. 退回補件 (needs resubmission) workflow: a reason field reviewers fill in when
-- rejecting a registration's documents, sent to the registrant by email alongside
-- their existing edit link (same link/token already used for self-service edits —
-- no separate upload mechanism needed). review_status already has a '退回補件' value
-- (see 20260727100001_init_schema.sql); this just adds the reason text that goes
-- with it and a matching editable email type.
-- ---------------------------------------------------------------------------
alter table public.registrations add column resubmission_reason text;

alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates
  add constraint email_templates_type_check check (type in ('報名確認', '審核結果', '退回補件'));
alter table public.session_email_templates drop constraint session_email_templates_type_check;
alter table public.session_email_templates
  add constraint session_email_templates_type_check check (type in ('報名確認', '審核結果', '退回補件'));

insert into public.email_templates (type, subject_template, body_template) values
(
  '退回補件',
  '【{{活動名稱}}】報名資料需要補件',
  '您好，您的報名資料經審核後，尚有部分項目需要補正：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}

需補件原因：
{{補件原因}}

請透過以下專屬連結重新上傳或修改資料：
{{修改連結}}

請妥善保存此連結，勿轉發給他人。完成補件後，我們將重新為您審核，如有任何疑問請洽詢主辦單位。
'
);

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
        when 'resubmission_reason' then '錄取分組結果'
        when 'is_cancelled' then '取消退費資訊'
        when 'cancelled_at' then '取消退費資訊'
        when 'cancel_reason' then '取消退費資訊'
        when 'refund_amount' then '取消退費資訊'
        when 'refund_status' then '取消退費資訊'
        when 'duplicate_flag' then '備註'
        when 'duplicate_note' then '備註'
        when 'admin_note' then '備註'
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

-- ---------------------------------------------------------------------------
-- 4. Lightweight per-session activity log — lets multiple admins working the same
-- session see who changed what and when, without building a full audit-trail system.
-- Only logs when a real authenticated admin session made the change (auth.uid() is
-- null for service-role/system writes), and only for the columns a human is actually
-- expected to hand-edit — payment_amount/sleeping_bag_* etc are system-derived and
-- deliberately excluded to avoid logging noise from cascading recompute triggers.
-- ---------------------------------------------------------------------------
create table public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  registration_seq int,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  admin_email text,
  summary text not null,
  created_at timestamptz not null default now()
);

create index idx_admin_activity_log_session on public.admin_activity_log(session_id, created_at desc);

alter table public.admin_activity_log enable row level security;

-- Read-only scoped like registrations; writes only happen via the trigger below
-- (security definer), so no INSERT policy is needed for any client role.
create policy admin_select_admin_activity_log on public.admin_activity_log
  for select to authenticated
  using (public.has_session_access(session_id));

create or replace function public.fn_log_registration_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_email text;
  v_changes text[] := '{}';
  v_labels jsonb := '{
    "review_status": "審核結果", "admission_status": "錄取結果",
    "waitlist_rank": "備取順位", "group_zone": "分組區域", "group_number": "分組編號",
    "tent_type": "帳篷類型", "is_cancelled": "取消狀態", "cancel_reason": "取消原因",
    "refund_amount": "退費金額", "refund_status": "退費狀態",
    "resubmission_reason": "補件原因", "admin_note": "備註",
    "payment_status": "繳費狀態", "payment_method": "繳費方式",
    "manual_transfer_last5": "轉帳後五碼", "manual_transfer_note": "轉帳備註"
  }'::jsonb;
  v_col text;
begin
  if v_admin_id is null then
    return new;
  end if;

  for v_col in select jsonb_object_keys(v_labels) loop
    if (to_jsonb(old) ->> v_col) is distinct from (to_jsonb(new) ->> v_col) then
      v_changes := array_append(v_changes, v_labels ->> v_col);
    end if;
  end loop;

  if array_length(v_changes, 1) is null then
    return new;
  end if;

  select email into v_admin_email from public.admin_users where id = v_admin_id;

  insert into public.admin_activity_log (session_id, registration_id, registration_seq, admin_user_id, admin_email, summary)
  values (
    new.session_id,
    new.id,
    new.registration_seq,
    v_admin_id,
    coalesce(v_admin_email, '未知使用者'),
    format('報名 #%s：更新 %s', new.registration_seq, array_to_string(v_changes, '、'))
  );

  return new;
end;
$$;

create trigger trg_log_registration_change
  after update on public.registrations
  for each row
  execute function public.fn_log_registration_change();
