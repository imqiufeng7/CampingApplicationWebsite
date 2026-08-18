-- The original policy only checked registration_id_a's session, so an admin who only
-- has access to the _b side of a cross-registration match (very possible — the
-- trigger sets _a to whichever registration was being inserted/edited when the match
-- was found, which isn't necessarily "their" side) couldn't see the match row at all.
drop policy if exists admin_select_duplicate_matches on public.duplicate_matches;
create policy admin_select_duplicate_matches on public.duplicate_matches
  for select to authenticated
  using (
    exists (
      select 1 from public.registrations r
      where r.id = duplicate_matches.registration_id_a
        and public.has_session_access(r.session_id)
    )
    or exists (
      select 1 from public.registrations r
      where r.id = duplicate_matches.registration_id_b
        and public.has_session_access(r.session_id)
    )
  );
