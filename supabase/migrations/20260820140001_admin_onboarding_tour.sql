-- Tracks whether an admin has been shown the first-login guided tour on each of the
-- three pages that have one (dashboard/reviews/payments — per-page, not one global
-- flag, since an admin might only ever visit some of these pages depending on role).
-- Timestamps rather than plain booleans for the same reason consent_given_at is a
-- timestamp elsewhere in this schema — "when" is free context to keep.
alter table public.admin_users
  add column dashboard_tour_seen_at timestamptz,
  add column reviews_tour_seen_at timestamptz,
  add column payments_tour_seen_at timestamptz;

-- Deliberately a narrow RPC rather than a self-update RLS policy: admin_users also
-- holds role_id/managed_session_ids on the same row, and a blanket "id = auth.uid()"
-- UPDATE policy would let any admin grant themselves the vendor role. This function
-- only ever touches the three tour columns, and only the caller's own row.
create or replace function public.mark_admin_tour_seen(p_page text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page = 'dashboard' then
    update public.admin_users set dashboard_tour_seen_at = now()
    where id = auth.uid() and dashboard_tour_seen_at is null;
  elsif p_page = 'reviews' then
    update public.admin_users set reviews_tour_seen_at = now()
    where id = auth.uid() and reviews_tour_seen_at is null;
  elsif p_page = 'payments' then
    update public.admin_users set payments_tour_seen_at = now()
    where id = auth.uid() and payments_tour_seen_at is null;
  else
    raise exception 'invalid tour page: %', p_page using errcode = '22023';
  end if;
end;
$$;

grant execute on function public.mark_admin_tour_seen(text) to authenticated;
