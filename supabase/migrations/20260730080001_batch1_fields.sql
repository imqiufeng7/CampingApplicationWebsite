-- Splits the single info_content field into the more granular pieces requested
-- (流程表/報名流程說明/減免內容 as separate fields, each hidden on the public page when
-- empty), and adds: a customizable post-submit success message, an optional
-- post-submit redirect button, and stores the actual rendered subject/body of every
-- sent notification email (previously only status/type was recorded, so there was no
-- way to review what was actually sent without server console access).

alter table public.event_sessions
  drop column if exists info_content;

alter table public.event_sessions
  add column schedule_content text,
  add column registration_process_content text,
  add column fee_waiver_content text,
  add column success_message_text text,
  add column redirect_url text,
  add column redirect_label text;

alter table public.email_logs
  add column subject text,
  add column body text;
