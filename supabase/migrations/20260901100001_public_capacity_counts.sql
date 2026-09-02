-- registrations has intentionally no SELECT policy for anon at all (see
-- 20260727100002_rls_policies.sql — "public submitters never read back registration
-- data"), which is correct for preventing PII exposure, but it also means the public
-- session page's own capacity-count queries have been silently returning zero rows
-- for real anonymous visitors ever since — the "已額滿" banner and disabled category
-- cards never actually appeared for anyone except an admin viewing the same page in
-- a browser that also happened to hold an authenticated session. The DB-level check
-- inside fn_submit_registration (SECURITY DEFINER, bypasses RLS) already stops any
-- over-capacity row from ever being inserted, so no bad data resulted — but real
-- visitors could fill out an entire form only to be rejected at the very last step.
--
-- These two functions return only aggregate counts (no PII, no row identity beyond a
-- category uuid) so the public page can restore the intended UX without reopening
-- read access to the registrations table itself.
create or replace function public.fn_get_session_registration_count(p_session_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.registrations
  where session_id = p_session_id and is_cancelled = false;
$$;

create or replace function public.fn_get_category_registration_counts(p_session_id uuid)
returns table (registration_category_id uuid, registration_count int)
language sql
stable
security definer
set search_path = public
as $$
  select registration_category_id, count(*)::int
  from public.registrations
  where session_id = p_session_id
    and is_cancelled = false
    and registration_category_id is not null
  group by registration_category_id;
$$;

grant execute on function public.fn_get_session_registration_count(uuid) to anon, authenticated;
grant execute on function public.fn_get_category_registration_counts(uuid) to anon, authenticated;
