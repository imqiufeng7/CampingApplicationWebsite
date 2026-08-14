-- Opening intro blurb shown above 流程表 (schedule_content).
alter table public.event_sessions
  add column intro_content text;
