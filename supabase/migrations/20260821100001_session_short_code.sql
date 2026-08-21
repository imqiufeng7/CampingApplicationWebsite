-- Public registration links (/s/<uuid>) are long enough to be awkward to share in
-- chat apps. short_code gives every session a short, random 6-character code that
-- /r/<code> (see app/r/[code]/route.ts) redirects to the full /s/<uuid> URL.
--
-- Added nullable first and backfilled via UPDATE (not a column DEFAULT on the ADD
-- COLUMN itself) so the volatile random() expression is unambiguously evaluated once
-- per existing row rather than depending on which Postgres version's ADD COLUMN fast-
-- path semantics apply.
alter table public.event_sessions add column short_code text;

update public.event_sessions
set short_code = substr(md5(random()::text || id::text), 1, 6)
where short_code is null;

alter table public.event_sessions
  alter column short_code set default substr(md5(random()::text || clock_timestamp()::text), 1, 6),
  alter column short_code set not null,
  add constraint event_sessions_short_code_key unique (short_code);
