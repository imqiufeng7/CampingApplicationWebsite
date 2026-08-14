-- Lets a fee category be flagged as "no review needed" — a member who picks one
-- (e.g. 自備帳篷並完成搭設、睡袋(墊)之參加者) gets their fee_review_result auto-set to
-- 無需繳費 once their registration is admitted (正取), instead of waiting on host_org
-- to manually review it. General-purpose flag, not hardcoded to any one category.
alter table public.session_fee_categories add column auto_approve boolean not null default false;

-- Auto-approves 審核中 members whose selected fee category is auto_approve, for a
-- given registration. Only touches 審核中 rows — a fee_review_result a human already
-- set (even back to 需繳費) is never overwritten, same "don't clobber a decided value"
-- rule as fn_recompute_registration_payment's 已完成 lock.
create or replace function public.fn_auto_approve_fee_categories(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.bypass_column_check', 'true', true);

  update public.registration_members rm
  set fee_review_result = '無需繳費'
  from public.session_fee_categories sfc
  where rm.registration_id = p_registration_id
    and rm.fee_category_id = sfc.id
    and sfc.auto_approve = true
    and rm.fee_review_result = '審核中';

  perform set_config('app.bypass_column_check', 'false', true);
end;
$$;

-- Fires when a registration is marked 正取 (the "但前提是他需要有被錄取的資格"
-- precondition) — covers the common path where admission happens after submission.
create or replace function public.trg_fn_auto_approve_on_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.admission_status = '正取' and old.admission_status is distinct from '正取' then
    perform public.fn_auto_approve_fee_categories(new.id);
  end if;
  return new;
end;
$$;

create trigger trg_auto_approve_on_admission
  after update of admission_status on public.registrations
  for each row
  execute function public.trg_fn_auto_approve_on_admission();

-- Covers the less common path: a member's fee_category_id is set/changed after their
-- registration is already 正取 (e.g. host_org corrects it post-admission).
create or replace function public.trg_fn_auto_approve_on_fee_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admission_status text;
begin
  select admission_status into v_admission_status
  from public.registrations
  where id = new.registration_id;

  if v_admission_status = '正取' then
    perform public.fn_auto_approve_fee_categories(new.registration_id);
  end if;
  return new;
end;
$$;

create trigger trg_auto_approve_on_fee_category_change
  after insert or update of fee_category_id on public.registration_members
  for each row
  execute function public.trg_fn_auto_approve_on_fee_category_change();

-- Sleeping bag counts are no longer host_org-entered numbers — they're derived from
-- how many of a registration's active members picked an auto_approve fee category
-- (self-supply) vs not (needs a rental). Not gated on admission status: organizers need
-- to plan on-site supply as soon as people register, not just once admission is final.
create or replace function public.fn_recompute_sleeping_bag_counts(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_own_qty int;
  v_total_qty int;
begin
  select
    count(*) filter (where sfc.auto_approve = true),
    count(*)
  into v_own_qty, v_total_qty
  from public.registration_members rm
  left join public.session_fee_categories sfc on sfc.id = rm.fee_category_id
  where rm.registration_id = p_registration_id;

  perform set_config('app.bypass_column_check', 'true', true);

  update public.registrations
  set sleeping_bag_own_qty = coalesce(v_own_qty, 0),
      sleeping_bag_rent_qty = coalesce(v_total_qty, 0) - coalesce(v_own_qty, 0)
  where id = p_registration_id;

  perform set_config('app.bypass_column_check', 'false', true);
end;
$$;

create or replace function public.trg_fn_recompute_sleeping_bag_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_recompute_sleeping_bag_counts(new.registration_id);
  return new;
end;
$$;

create trigger trg_recompute_sleeping_bag_counts
  after insert or update of fee_category_id on public.registration_members
  for each row
  execute function public.trg_fn_recompute_sleeping_bag_counts();
