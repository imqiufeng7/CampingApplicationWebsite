-- registrations previously had no DELETE policy for any client role at all (only
-- is_cancelled, a reversible flag, was writable) — vendor now gets a real hard-delete
-- for genuinely bad/test/duplicate rows. registration_members/registration_files/
-- email_logs/duplicate_matches all cascade on the FK already (see init_schema.sql),
-- so this one delete cleans up everything except the underlying Storage objects
-- (those aren't touched by a DB-level delete and would need separate cleanup).
create policy vendor_delete_registrations on public.registrations
  for delete to authenticated
  using (public.current_admin_role() = 'vendor');
