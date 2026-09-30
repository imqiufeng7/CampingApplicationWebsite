-- Where 自搭帳 vehicles unload their tents, quoted in the 行前通知 (e.g. 大成路一段).
-- Per session because each venue has its own entrance.
alter table public.event_sessions add column unload_entrance text;
