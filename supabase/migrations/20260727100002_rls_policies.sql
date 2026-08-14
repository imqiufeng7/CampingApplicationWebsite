-- Row Level Security: role-based access scoped per session.
-- Helper functions are SECURITY DEFINER so policies on other tables can consult
-- admin_users without recursing into admin_users' own RLS.

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admin_users where id = auth.uid();
$$;

create or replace function public.current_admin_managed_sessions()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select managed_session_ids from public.admin_users where id = auth.uid();
$$;

grant execute on function public.current_admin_role() to anon, authenticated;
grant execute on function public.current_admin_managed_sessions() to anon, authenticated;

create or replace function public.has_session_access(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() = 'vendor'
    or target_session_id = any(coalesce(public.current_admin_managed_sessions(), '{}'));
$$;

grant execute on function public.has_session_access(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- event_series / event_sessions / session_identity_types / session_fee_categories
-- vendor: full CRUD. Any logged-in admin: read all (incl. drafts) so they can see
-- what they're assigned to. Anon: read only sessions that are currently open
-- (needed by the public registration form, which is unauthenticated).
-- ---------------------------------------------------------------------------
alter table public.event_series enable row level security;
alter table public.event_sessions enable row level security;
alter table public.session_identity_types enable row level security;
alter table public.session_fee_categories enable row level security;

create policy admin_select_event_series on public.event_series
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy anon_select_open_event_series on public.event_series
  for select to anon
  using (exists (
    select 1 from public.event_sessions es
    where es.series_id = event_series.id and es.status = 'open'
  ));

create policy vendor_write_event_series on public.event_series
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

create policy admin_select_event_sessions on public.event_sessions
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy anon_select_open_event_sessions on public.event_sessions
  for select to anon
  using (status = 'open');

create policy vendor_write_event_sessions on public.event_sessions
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

create policy admin_select_session_identity_types on public.session_identity_types
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy anon_select_open_session_identity_types on public.session_identity_types
  for select to anon
  using (exists (
    select 1 from public.event_sessions es
    where es.id = session_identity_types.session_id and es.status = 'open'
  ));

create policy vendor_write_session_identity_types on public.session_identity_types
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

create policy admin_select_session_fee_categories on public.session_fee_categories
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy anon_select_open_session_fee_categories on public.session_fee_categories
  for select to anon
  using (exists (
    select 1 from public.event_sessions es
    where es.id = session_fee_categories.session_id and es.status = 'open'
  ));

create policy vendor_write_session_fee_categories on public.session_fee_categories
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

-- ---------------------------------------------------------------------------
-- registrations / registration_members / registration_files
-- SELECT: admins scoped to vendor-or-managed-session. No SELECT for anon at all —
-- public submitters never read back registration data (matches spec's ban on
-- shareable-link-style access to PII).
-- INSERT: intentionally has NO policy for any client role. The only way to create a
-- registration is the fn_submit_registration() SECURITY DEFINER RPC below, which
-- validates the session's open window itself and bypasses RLS as its owner.
-- UPDATE: admins scoped the same way as SELECT; column-level enforcement is handled
-- by the triggers in the next migration.
-- DELETE: no policy for any client role (cancellation is a flag, not a delete).
-- ---------------------------------------------------------------------------
alter table public.registrations enable row level security;
alter table public.registration_members enable row level security;
alter table public.registration_files enable row level security;

create policy admin_select_registrations on public.registrations
  for select to authenticated
  using (public.has_session_access(session_id));

create policy admin_update_registrations on public.registrations
  for update to authenticated
  using (public.has_session_access(session_id))
  with check (public.has_session_access(session_id));

create policy admin_select_registration_members on public.registration_members
  for select to authenticated
  using (exists (
    select 1 from public.registrations r
    where r.id = registration_members.registration_id
      and public.has_session_access(r.session_id)
  ));

create policy admin_update_registration_members on public.registration_members
  for update to authenticated
  using (exists (
    select 1 from public.registrations r
    where r.id = registration_members.registration_id
      and public.has_session_access(r.session_id)
  ))
  with check (exists (
    select 1 from public.registrations r
    where r.id = registration_members.registration_id
      and public.has_session_access(r.session_id)
  ));

create policy admin_select_registration_files on public.registration_files
  for select to authenticated
  using (exists (
    select 1 from public.registrations r
    where r.id = registration_files.registration_id
      and public.has_session_access(r.session_id)
  ));

-- ---------------------------------------------------------------------------
-- admin_users
-- Each admin can read their own row (needed to bootstrap role lookups client-side);
-- vendor can read/manage all rows. First vendor row must be inserted via the
-- service-role key or Supabase Studio's SQL editor (both bypass RLS) — see README.
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;

create policy self_select_admin_users on public.admin_users
  for select to authenticated
  using (id = auth.uid() or public.current_admin_role() = 'vendor');

create policy vendor_write_admin_users on public.admin_users
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

-- ---------------------------------------------------------------------------
-- email_logs / duplicate_matches
-- Admin-only SELECT scoped like registrations. INSERT/UPDATE reserved for the
-- service-role client (email batch job / future duplicate-matching job) — no
-- policy is defined for client roles, so it's denied by default.
-- ---------------------------------------------------------------------------
alter table public.email_logs enable row level security;
alter table public.duplicate_matches enable row level security;

create policy admin_select_email_logs on public.email_logs
  for select to authenticated
  using (exists (
    select 1 from public.registrations r
    where r.id = email_logs.registration_id
      and public.has_session_access(r.session_id)
  ));

create policy admin_select_duplicate_matches on public.duplicate_matches
  for select to authenticated
  using (exists (
    select 1 from public.registrations r
    where r.id = duplicate_matches.registration_id_a
      and public.has_session_access(r.session_id)
  ));
