-- Bug fix: 20260820100001_payment_deadline.sql rewrote
-- enforce_registration_members_column_permissions() to restore the
-- app.bypass_column_check early-exit, but copied its body from a version that
-- predates 20260819090003_per_member_resubmission.sql — silently dropping the
-- needs_resubmission/resubmission_note -> 免付費審核結果 mapping that migration
-- had just added. Since then, no role (including host_org, who is editable on
-- 免付費審核結果) could actually save "此成員需要補件"/its note: the trigger's
-- field_group lookup fell through to null and unconditionally raised 42501.
-- Restoring the mapping here.
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
