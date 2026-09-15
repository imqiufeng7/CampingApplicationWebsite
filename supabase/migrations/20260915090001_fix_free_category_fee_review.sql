-- Bug: a registration submitted under a session_registration_categories row marked
-- 整組免費 (is_free = true, e.g. 自搭帳) was still being charged. fn_submit_registration
-- correctly set fee_review_result = '無需繳費' for every member in that case, but
-- trg_compute_member_fee_review_result (added later, for the unrelated per-member
-- 減免資格/session_fee_categories auto-approve feature) is a BEFORE INSERT trigger on
-- registration_members that unconditionally overwrites fee_review_result to '需繳費'
-- whenever fee_category_id is null — which it always is for a fully-free
-- registration category, since MemberFieldGroup hides that field entirely in that
-- case. The two "free" mechanisms are independent (one is registration-category-wide,
-- the other is a per-member exemption a reviewer approves), and this trigger only
-- ever knew about the latter.
create or replace function public.fn_compute_member_fee_review_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto_approve boolean;
  v_category_is_free boolean;
begin
  -- A member registered under a 整組免費 registration category never needs review
  -- or payment, regardless of whether fee_category_id is set — that's a separate,
  -- member-level exemption mechanism this must not be confused with. Checked first
  -- so it wins over every other branch below.
  select src.is_free into v_category_is_free
  from public.registrations r
  join public.session_registration_categories src on src.id = r.registration_category_id
  where r.id = new.registration_id;

  if v_category_is_free then
    new.fee_review_result := '無需繳費';
    return new;
  end if;

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

-- Data repair: every existing member wrongly charged under a 整組免費 registration
-- category, corrected to match what fn_submit_registration always intended.
-- Updating fee_review_result fires trg_recompute_registration_payment, which brings
-- payment_status/payment_amount back in line automatically.
update public.registration_members rm
set fee_review_result = '無需繳費'
from public.registrations r
join public.session_registration_categories src on src.id = r.registration_category_id
where rm.registration_id = r.id
  and src.is_free = true
  and rm.fee_review_result <> '無需繳費';
