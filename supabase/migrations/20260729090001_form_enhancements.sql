-- Adds: full ROC birth date (month/day, not just year), and per-session public-facing
-- content (banner image, info/rules/consent/reminder text) requested after reviewing
-- the real form with the client. A separate public bucket is used for banner images
-- since they must be viewable by anonymous registrants without a signed URL, unlike
-- the deliberately-private registration-files bucket.

alter table public.registration_members
  add column birth_month int check (birth_month between 1 and 12),
  add column birth_day int check (birth_day between 1 and 31);

alter table public.event_sessions
  add column banner_image_path text,
  add column info_content text,
  add column rules_text text,
  add column privacy_consent_text text,
  add column submit_reminder_text text;

insert into storage.buckets (id, name, public)
values ('session-assets', 'session-assets', true)
on conflict (id) do nothing;

create policy vendor_write_session_assets on storage.objects
  for all to authenticated
  using (bucket_id = 'session-assets' and public.current_admin_role() = 'vendor')
  with check (bucket_id = 'session-assets' and public.current_admin_role() = 'vendor');
