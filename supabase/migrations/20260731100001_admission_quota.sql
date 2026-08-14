-- Separate from capacity_total (which gates whether the public form accepts more
-- registrations at all, e.g. 80 groups). admission_quota is the actual number of
-- groups the organizer intends to admit (e.g. 50) — purely informational for the
-- dashboard/review screens, not enforced anywhere: admission_status is still a manual
-- per-registration call, this just gives reviewers a target to check progress against.
alter table public.event_sessions add column admission_quota int;
