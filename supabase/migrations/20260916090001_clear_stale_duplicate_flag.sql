-- Bug: duplicate_matches rows are on DELETE CASCADE from registrations (see
-- init_schema.sql), so deleting one side of a duplicate pair (the normal way staff
-- resolve a 疑似重複 — DeleteRegistrationButton's hard delete) removes the match row
-- automatically. Nothing ever reset the *surviving* registration's duplicate_flag
-- back to false when that happens, though — it was only ever set to true, never
-- cleared — so the survivor stayed flagged forever with an empty 疑似重複 cell (no
-- matches left to render), which is exactly what showed up filtering "只看疑似重複"
-- for a registration with no visible duplicate badge (e.g. R000191).
create or replace function public.fn_clear_duplicate_flag_if_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registrations
  set duplicate_flag = false
  where id in (old.registration_id_a, old.registration_id_b)
    and duplicate_flag = true
    and not exists (
      select 1 from public.duplicate_matches dm
      where dm.registration_id_a = registrations.id or dm.registration_id_b = registrations.id
    );
  return old;
end;
$$;

create trigger trg_clear_duplicate_flag_on_match_delete
after delete on public.duplicate_matches
for each row
execute function public.fn_clear_duplicate_flag_if_resolved();

-- Data repair: clear the stale flag on every registration currently marked
-- duplicate_flag = true with no duplicate_matches row actually left to justify it.
update public.registrations r
set duplicate_flag = false
where r.duplicate_flag = true
  and not exists (
    select 1 from public.duplicate_matches dm
    where dm.registration_id_a = r.id or dm.registration_id_b = r.id
  );
