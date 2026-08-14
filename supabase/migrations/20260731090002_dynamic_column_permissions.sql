-- Rewrites the column-permission triggers from hardcoded per-role column arrays to
-- data-driven lookups against field_permission_matrix (via public.field_permission()).
-- The column -> field_group mapping below reproduces exactly what the old hardcoded
-- host_org_cols/finance_cols arrays already granted, so this migration changes no
-- behavior by itself — only once vendor edits the matrix on the new permissions page
-- does anything actually diverge from today.

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

-- The payment-recompute trigger (fn_recompute_registration_payment, see
-- 20260730190001_payment_auto_derivation.sql) still bypasses this via
-- app.bypass_column_check exactly as before — untouched by this migration.

-- Gate the one RPC that can ever produce a plaintext ID number behind the
-- 身份證明文件 field group, same as the document signed-url route (app layer).
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

  if public.field_permission('身份證明文件') = 'hidden' then
    return null;
  end if;

  if v_encrypted is null then
    return null;
  end if;

  return pgp_sym_decrypt(v_encrypted, private.id_number_key());
end;
$$;
