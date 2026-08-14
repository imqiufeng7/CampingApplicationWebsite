-- Lets the vendor pick a background color per session for the public registration page.
alter table public.event_sessions
  add column theme_color text;
