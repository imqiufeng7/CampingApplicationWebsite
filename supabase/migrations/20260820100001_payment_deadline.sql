-- Payment deadline: vendor sets a default per session (event_sessions.payment_deadline_at,
-- same pattern as registration_close_at/cancel_deadline_at), auto-copied onto a
-- registration (registrations.payment_deadline) the first time it becomes payable so
-- payment windows aren't indefinite by default. Extending an individual registrant's
-- deadline afterwards is a manual per-registration override via the payments UI (see
-- extendPaymentDeadlineAndResend in registrations/[sessionId]/[registrationId]/actions.ts),
-- which also re-sends the payment notice email with the new deadline+link.

alter table public.event_sessions add column payment_deadline_at timestamptz;
alter table public.registrations add column payment_deadline timestamptz;

-- Bug fix: enforce_registrations_column_permissions()/enforce_registration_members_
-- column_permissions() lost their `current_setting('app.bypass_column_check', true)`
-- early-exit somewhere across the 20260731090002 (matrix rewrite) / 20260817 / 20260819
-- redefinitions — each was a `create or replace function` that copied forward the
-- previous body verbatim minus that one check, which the original
-- 20260730190001_payment_auto_derivation.sql migration's comment explicitly documents
-- as required for fn_recompute_registration_payment's own internal UPDATE to survive
-- the trigger. Concretely this means host_org approving/rejecting a member's fee
-- waiver (editable for them under 免付費審核結果) would crash with a 42501 the moment
-- that write cascades into fn_recompute_registration_payment's update of
-- registrations.payment_status/amount/method — a column group host_org only has
-- readonly on. Restoring it here, plus wiring the new payment_deadline column into the
-- 繳費狀態 group mapping.
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
  if current_setting('app.bypass_column_check', true) = 'true' then
    return new;
  end if;

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
        when 'payment_deadline' then '繳費狀態'
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
  if current_setting('app.bypass_column_check', true) = 'true' then
    return new;
  end if;

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

-- Auto-populate payment_deadline from the session's default the first time a
-- registration actually becomes payable, without ever clobbering a value already set
-- (a prior auto-fill, or a manual per-registrant extension from the payments UI).
create or replace function public.fn_recompute_registration_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
  v_session_id uuid;
  v_current_status text;
  v_current_deadline timestamptz;
  v_paying_count int;
  v_unit_fee numeric;
  v_default_deadline timestamptz;
begin
  v_registration_id := coalesce(new.registration_id, old.registration_id);

  select session_id, payment_status, payment_deadline into v_session_id, v_current_status, v_current_deadline
  from public.registrations
  where id = v_registration_id
  for update;

  if v_current_status = '已完成' then
    return coalesce(new, old);
  end if;

  select fee_discount_per_person, payment_deadline_at into v_unit_fee, v_default_deadline
  from public.event_sessions
  where id = v_session_id;

  select count(*) into v_paying_count
  from public.registration_members
  where registration_id = v_registration_id
    and fee_review_result not in ('無需繳費', '審核通過');

  perform set_config('app.bypass_column_check', 'true', true);

  if v_paying_count = 0 then
    update public.registrations
    set payment_status = '無需繳費', payment_amount = 0, payment_method = null
    where id = v_registration_id;
  else
    update public.registrations
    set payment_status = '待繳費',
        payment_amount = v_paying_count * coalesce(v_unit_fee, 0),
        payment_method = coalesce(payment_method, 'online'),
        payment_deadline = coalesce(v_current_deadline, v_default_deadline)
    where id = v_registration_id;
  end if;

  perform set_config('app.bypass_column_check', 'false', true);

  return coalesce(new, old);
end;
$$;
