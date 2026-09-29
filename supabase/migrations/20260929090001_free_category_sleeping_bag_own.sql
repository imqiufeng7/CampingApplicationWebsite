-- 自搭帳-style registration categories (session_registration_categories.is_free) bring
-- their own tent and bedding, but fn_recompute_sleeping_bag_counts only counted a
-- member as self-supply when they picked an auto_approve fee category (自備睡袋(墊)).
-- Free-category members never pick a fee category at all (the form hides it), so every
-- one of them was being counted as a rental. Treat every member of an is_free
-- registration as self-supply.
--
-- Also recompute on member DELETE: the old trigger only fired on insert/update, so
-- removing a member left the registration's counts stale.
create or replace function public.fn_recompute_sleeping_bag_counts(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_own_qty int;
  v_total_qty int;
  v_is_free boolean;
begin
  select coalesce(rc.is_free, false) into v_is_free
  from public.registrations r
  left join public.session_registration_categories rc on rc.id = r.registration_category_id
  where r.id = p_registration_id;

  select
    case when v_is_free then count(*) else count(*) filter (where sfc.auto_approve = true) end,
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
  perform public.fn_recompute_sleeping_bag_counts(coalesce(new.registration_id, old.registration_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recompute_sleeping_bag_counts on public.registration_members;
create trigger trg_recompute_sleeping_bag_counts
  after insert or update of fee_category_id or delete on public.registration_members
  for each row
  execute function public.trg_fn_recompute_sleeping_bag_counts();

-- Backfill every existing registration under the new rule.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.registrations loop
    perform public.fn_recompute_sleeping_bag_counts(v_id);
  end loop;
end;
$$;
