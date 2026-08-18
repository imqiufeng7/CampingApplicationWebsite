-- 退回補件 (needs resubmission) moves from a whole-registration toggle to a per-member
-- flag: different members in the same registration can have different problems with
-- their documents, so the reviewer needs to flag/describe the issue per person from
-- inside the document dialog, not for the registration as a whole from the overview.

alter table public.registration_members add column needs_resubmission boolean not null default false;
alter table public.registration_members add column resubmission_note text;

-- registrations.resubmission_reason is superseded by the per-member note (the email
-- now composes its "需補件原因" section from every flagged member's note) — dropped
-- rather than left as unused dead weight now that nothing writes to it.
alter table public.registrations drop column resubmission_reason;

create or replace function public.fn_recompute_registration_review_status(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needs_resubmission_count int;
  v_pending_count int;
  v_status text;
begin
  select
    count(*) filter (where needs_resubmission),
    count(*) filter (where fee_review_result = '審核中')
  into v_needs_resubmission_count, v_pending_count
  from public.registration_members
  where registration_id = p_registration_id;

  v_status := case
    when v_needs_resubmission_count > 0 then '退回補件'
    when v_pending_count > 0 then '審核中'
    else '審核通過'
  end;

  perform set_config('app.bypass_column_check', 'true', true);
  update public.registrations set review_status = v_status where id = p_registration_id;
  perform set_config('app.bypass_column_check', 'false', true);
end;
$$;

drop trigger if exists trg_recompute_registration_review_status on public.registration_members;
create trigger trg_recompute_registration_review_status
  after insert or update of fee_review_result, needs_resubmission or delete on public.registration_members
  for each row
  execute function public.trg_fn_recompute_registration_review_status();

-- Backfill: nothing was ever set for needs_resubmission (new column, defaults false),
-- so re-run the recompute once to drop any registration currently stuck at 退回補件
-- from the old whole-registration toggle back to its member-driven status.
do $$
declare
  v_reg record;
begin
  for v_reg in select id from public.registrations loop
    perform public.fn_recompute_registration_review_status(v_reg.id);
  end loop;
end $$;

-- admin_activity_log's field-label map references resubmission_reason, which no
-- longer exists — swap it for the new per-member columns' registration_members-side
-- equivalent isn't logged here (that table isn't covered by this trigger); just drop
-- the stale key so the function doesn't reference a dropped column.
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
    "admin_note": "備註",
    "payment_status": "繳費狀態", "payment_method": "繳費方式",
    "manual_transfer_last5": "轉帳後五碼", "manual_transfer_note": "轉帳備註"
  }'::jsonb;
  v_col text;
  v_old_val text;
  v_new_val text;
begin
  if v_admin_id is null then
    return new;
  end if;

  for v_col in select jsonb_object_keys(v_labels) loop
    v_old_val := to_jsonb(old) ->> v_col;
    v_new_val := to_jsonb(new) ->> v_col;
    if v_old_val is distinct from v_new_val then
      v_changes := array_append(
        v_changes,
        format('%s：%s → %s', v_labels ->> v_col, coalesce(nullif(v_old_val, ''), '（空）'), coalesce(nullif(v_new_val, ''), '（空）'))
      );
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
    format('報名 #%s：%s', new.registration_seq, array_to_string(v_changes, '；'))
  );

  return new;
end;
$$;

-- registrations.resubmission_reason no longer exists — drop its case from the
-- registrations-level column-permission trigger too.
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

-- fee_review_result / needs_resubmission / resubmission_note are the reviewer-facing
-- per-member review fields, same field group as the existing 免付費審核結果 columns.
create or replace function public.enforce_registration_members_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text := public.current_admin_role();
  ignored_cols text[] := array['id'];
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
        when 'identity_type_id' then '個人基本資料'
        when 'org_selected' then '個人基本資料'
        when 'org_other_text' then '個人基本資料'
        when 'fee_category_id' then '免付費審核結果'
        when 'fee_review_result' then '免付費審核結果'
        when 'needs_resubmission' then '免付費審核結果'
        when 'resubmission_note' then '免付費審核結果'
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
