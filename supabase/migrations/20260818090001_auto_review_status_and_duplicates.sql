-- Two changes requested after the second round of client testing:
--
-- 1. fee_review_result / review_status become system-computed instead of manually
--    picked. A member's fee waiver status is now purely a function of which fee
--    category (if any) they applied for: no application -> 需繳費, an auto_approve
--    category (自備睡袋(墊) etc) -> 無需繳費, any other category -> 審核中 until a
--    reviewer decides 需繳費/無需繳費 after checking the uploaded document. 審核通過 is
--    removed as a member-level value entirely. The registration-level review_status
--    shown in the review table then reflects the aggregate: 審核中 while any member is
--    still 審核中, otherwise 審核通過 — computed, not a dropdown choice; 退回補件 remains
--    the one value a reviewer sets manually (unchanged from the resubmission-notice
--    workflow added earlier), and gets superseded back to 審核中/審核通過 the next time
--    any member's fee review state changes (i.e. once the registrant has acted).
--
-- 2. Duplicate-registration detection (身分證字號+姓名 or 姓名+電話, scoped to the whole
--    event series, per 報名系統開發規格書.md 第8節) — the duplicate_flag/duplicate_matches
--    columns already existed but nothing ever set them ("deferred feature — table kept
--    ready", per the original schema migration's comment). This wires it up.

-- ---------------------------------------------------------------------------
-- fee_review_result: drop 審核通過 as an allowed value, backfill existing rows using
-- the new rule, then install the auto-compute trigger.
-- ---------------------------------------------------------------------------
update public.registration_members rm
set fee_review_result = case
  when rm.fee_category_id is null then '需繳費'
  when sfc.auto_approve then '無需繳費'
  when rm.fee_review_result = '審核通過' then '無需繳費' -- best-effort mapping for the one removed value
  else rm.fee_review_result
end
from public.session_fee_categories sfc
where rm.fee_category_id = sfc.id or rm.fee_category_id is null;

-- Covers rows whose fee_category_id doesn't join (shouldn't happen given the FK, but
-- keeps the backfill exhaustive without relying on the join above for the null case).
update public.registration_members
set fee_review_result = '需繳費'
where fee_category_id is null and fee_review_result <> '需繳費';

alter table public.registration_members drop constraint registration_members_fee_review_result_check;
alter table public.registration_members
  add constraint registration_members_fee_review_result_check
  check (fee_review_result in ('審核中', '需繳費', '無需繳費'));

create or replace function public.fn_compute_member_fee_review_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto_approve boolean;
begin
  if new.fee_category_id is null then
    new.fee_review_result := '需繳費';
    return new;
  end if;

  select auto_approve into v_auto_approve
  from public.session_fee_categories
  where id = new.fee_category_id;

  if v_auto_approve then
    new.fee_review_result := '無需繳費';
    return new;
  end if;

  -- Needs human review. Only reset to 審核中 when fee_category_id is actually new/
  -- changed (insert, or an update that changed it) — a reviewer's already-made
  -- 需繳費/無需繳費 decision for the same category must not be clobbered by unrelated
  -- row updates that happen to pass fee_category_id through unchanged.
  if TG_OP = 'INSERT' or OLD.fee_category_id is distinct from NEW.fee_category_id then
    new.fee_review_result := '審核中';
  end if;

  return new;
end;
$$;

create trigger trg_compute_member_fee_review_result
  before insert or update of fee_category_id on public.registration_members
  for each row
  execute function public.fn_compute_member_fee_review_result();

-- ---------------------------------------------------------------------------
-- registrations.review_status: 審核中 while any member is still 審核中, otherwise
-- 審核通過 — except 退回補件, which stays a manual-only value (this function only ever
-- writes 審核中/審核通過).
-- ---------------------------------------------------------------------------
create or replace function public.fn_recompute_registration_review_status(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_count int;
begin
  select count(*) into v_pending_count
  from public.registration_members
  where registration_id = p_registration_id
    and fee_review_result = '審核中';

  perform set_config('app.bypass_column_check', 'true', true);
  update public.registrations
  set review_status = case when v_pending_count > 0 then '審核中' else '審核通過' end
  where id = p_registration_id;
  perform set_config('app.bypass_column_check', 'false', true);
end;
$$;

create or replace function public.trg_fn_recompute_registration_review_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_recompute_registration_review_status(coalesce(new.registration_id, old.registration_id));
  return new;
end;
$$;

create trigger trg_recompute_registration_review_status
  after insert or update of fee_review_result or delete on public.registration_members
  for each row
  execute function public.trg_fn_recompute_registration_review_status();

-- Backfill existing registrations' review_status from the members as they now stand
-- (skips ones currently 退回補件 — that's a manual state, left as the reviewer set it).
do $$
declare
  v_reg record;
begin
  for v_reg in select id from public.registrations where review_status <> '退回補件' loop
    perform public.fn_recompute_registration_review_status(v_reg.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Duplicate detection: 身分證字號+姓名 or 姓名+電話 match, scoped to the same event
-- series (across all its sessions). Fires per inserted member so it also catches
-- duplicates introduced by an edit (fn_update_registration_via_token re-inserts?
-- no — it updates in place, so this only needs an INSERT trigger for new
-- registrations; edits changing name/id-number are a rarer case intentionally left
-- for the existing duplicate_flag to be manually cleared/re-evaluated by a human).
-- ---------------------------------------------------------------------------
create or replace function public.fn_check_duplicate_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series_id uuid;
  v_contact_phone text;
  v_new_id_number text;
  v_match record;
begin
  select es.series_id, r.contact_phone
  into v_series_id, v_contact_phone
  from public.registrations r
  join public.event_sessions es on es.id = r.session_id
  where r.id = new.registration_id;

  if new.id_number_encrypted is not null then
    v_new_id_number := pgp_sym_decrypt(new.id_number_encrypted, private.id_number_key());
  end if;

  for v_match in
    select distinct r2.id as other_registration_id
    from public.registration_members rm2
    join public.registrations r2 on r2.id = rm2.registration_id
    join public.event_sessions es2 on es2.id = r2.session_id
    where es2.series_id = v_series_id
      and r2.id <> new.registration_id
      and r2.is_cancelled = false
      and rm2.name = new.name
      and (
        r2.contact_phone = v_contact_phone
        or (
          v_new_id_number is not null and rm2.id_number_encrypted is not null
          and pgp_sym_decrypt(rm2.id_number_encrypted, private.id_number_key()) = v_new_id_number
        )
      )
  loop
    perform set_config('app.bypass_column_check', 'true', true);
    update public.registrations set duplicate_flag = true
    where id in (new.registration_id, v_match.other_registration_id);
    perform set_config('app.bypass_column_check', 'false', true);

    insert into public.duplicate_matches (registration_id_a, registration_id_b, matched_by, diff_summary)
    select new.registration_id, v_match.other_registration_id, 'system',
      jsonb_build_object('matched_member_name', new.name)
    where not exists (
      select 1 from public.duplicate_matches
      where (registration_id_a = new.registration_id and registration_id_b = v_match.other_registration_id)
         or (registration_id_a = v_match.other_registration_id and registration_id_b = new.registration_id)
    );
  end loop;

  return new;
end;
$$;

create trigger trg_check_duplicate_registration
  after insert on public.registration_members
  for each row
  execute function public.fn_check_duplicate_registration();
