-- Column-level permission enforcement. Postgres RLS is row-level only, so the
-- host_org-vs-finance split ("host_org edits review/admission/grouping/cancel,
-- finance edits payment") is enforced here with BEFORE UPDATE triggers that inspect
-- which columns actually changed. This is the real security boundary — UI-level
-- disabling of fields is cosmetic only. `current_admin_role() is null` (service-role
-- connections, which have no auth.uid()) bypasses the check by design: those are the
-- few narrow, reviewed server-side paths (ECPay webhook, email batch job) that
-- legitimately act with no admin identity. A non-admin authenticated user with no
-- admin_users row also gets role = null, but can never reach this trigger because the
-- RLS UPDATE policy already blocks them from matching any row.

create or replace function public.enforce_registrations_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text := public.current_admin_role();
  host_org_cols text[] := array[
    'review_status', 'admission_status', 'waitlist_rank',
    'group_zone', 'group_number', 'tent_type',
    'sleeping_bag_own_qty', 'sleeping_bag_rent_qty',
    'is_cancelled', 'cancelled_at', 'cancel_reason',
    'refund_amount', 'refund_status',
    'duplicate_flag', 'duplicate_note',
    'checkin_at', 'checkin_by',
    'admin_note'
  ];
  finance_cols text[] := array[
    'payment_status', 'payment_amount', 'payment_method',
    'ecpay_trade_no', 'ecpay_link',
    'manual_transfer_last5', 'manual_transfer_note'
  ];
  allowed_cols text[];
  ignored_cols text[] := array['id', 'updated_at'];
  col text;
begin
  if admin_role is null or admin_role = 'vendor' then
    return new;
  elsif admin_role = 'host_org' then
    allowed_cols := host_org_cols;
  elsif admin_role = 'finance' then
    allowed_cols := finance_cols;
  else
    allowed_cols := array[]::text[];
  end if;

  for col in select key from jsonb_each(to_jsonb(new)) loop
    if col = any(ignored_cols) then
      continue;
    end if;
    if (to_jsonb(old) ->> col) is distinct from (to_jsonb(new) ->> col) then
      if not (col = any(allowed_cols)) then
        raise exception 'role % is not permitted to modify column %', admin_role, col
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_registrations_column_permissions
  before update on public.registrations
  for each row
  execute function public.enforce_registrations_column_permissions();

create or replace function public.enforce_registration_members_column_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role text := public.current_admin_role();
  host_org_cols text[] := array[
    'identity_type_id', 'org_selected', 'org_other_text',
    'fee_category_id', 'fee_review_result'
  ];
  allowed_cols text[];
  ignored_cols text[] := array['id'];
  col text;
begin
  if admin_role is null or admin_role = 'vendor' then
    return new;
  elsif admin_role = 'host_org' then
    allowed_cols := host_org_cols;
  else
    -- finance has no editable columns on registration_members
    allowed_cols := array[]::text[];
  end if;

  for col in select key from jsonb_each(to_jsonb(new)) loop
    if col = any(ignored_cols) then
      continue;
    end if;
    if (to_jsonb(old) ->> col) is distinct from (to_jsonb(new) ->> col) then
      if not (col = any(allowed_cols)) then
        raise exception 'role % is not permitted to modify column %', admin_role, col
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

create trigger trg_registration_members_column_permissions
  before update on public.registration_members
  for each row
  execute function public.enforce_registration_members_column_permissions();
