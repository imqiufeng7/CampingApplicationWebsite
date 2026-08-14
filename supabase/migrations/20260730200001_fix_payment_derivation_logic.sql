-- Bug fix: fn_recompute_registration_payment() counted anyone whose fee_review_result
-- wasn't literally '無需繳費' as owing money — which wrongly included '審核通過'
-- (fee waiver request APPROVED, i.e. they don't pay). '審核通過' and '無需繳費' are both
-- "waived" outcomes; only '審核中' (pending) and '需繳費' (waiver rejected / no waiver
-- requested) should count toward payment_amount.
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
  v_paying_count int;
  v_unit_fee numeric;
begin
  v_registration_id := coalesce(new.registration_id, old.registration_id);

  select session_id, payment_status into v_session_id, v_current_status
  from public.registrations
  where id = v_registration_id
  for update;

  if v_current_status = '已完成' then
    return coalesce(new, old);
  end if;

  select fee_discount_per_person into v_unit_fee
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
        payment_method = coalesce(payment_method, 'online')
    where id = v_registration_id;
  end if;

  perform set_config('app.bypass_column_check', 'false', true);

  return coalesce(new, old);
end;
$$;
