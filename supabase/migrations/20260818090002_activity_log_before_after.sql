-- The activity log summary only listed which fields changed (e.g. "更新 審核結果、
-- 備註"), not what changed from/to — not useful enough for two admins to reconcile
-- who did what. Rewritten to include each changed field's old -> new value.
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
