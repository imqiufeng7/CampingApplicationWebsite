-- Lets the vendor customize the intro consent-gate paragraph (the "同意/不同意" screen
-- shown before the registration form fields). Supports a {{活動名稱}} placeholder that
-- gets substituted with the series+session name at render time, since that part
-- should stay dynamic even when the surrounding wording is customized.
alter table public.event_sessions
  add column consent_gate_text text;
