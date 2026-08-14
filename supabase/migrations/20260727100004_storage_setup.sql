-- Private storage bucket for uploaded registration documents (身分證/戶籍謄本/健保卡/
-- 身心障礙證明 etc). Deliberately NO storage.objects RLS policies are added for
-- anon/authenticated — that means those roles have zero direct access. Both upload
-- and download go through server-side Route Handlers using the service-role client,
-- which mints short-lived signed URLs after doing an authorization check in
-- application code (see lib/supabase/admin.ts, app/api/storage/*). This avoids
-- writing storage.objects policies that would need to parse registration_id back out
-- of object paths and join across tables inside the policy itself.

insert into storage.buckets (id, name, public)
values ('registration-files', 'registration-files', false)
on conflict (id) do nothing;
