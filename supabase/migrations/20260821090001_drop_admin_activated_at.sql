-- Reverts 20260820200001 — the vendor's actual preference turned out to be simpler
-- than what that migration built: "尚未完成密碼設定" should be decided purely by
-- whether the admin has ever signed in (auth.users.last_sign_in_at), not a separate
-- activated_at flag set at the end of the password-setup form. Every existing admin
-- had already set a password before activated_at existed, so it was null for all of
-- them regardless of login history — showing "尚未完成密碼設定" for admins who
-- log in daily. Dropping the column/function rather than leaving them unused.
drop function if exists public.mark_admin_activated();
alter table public.admin_users drop column if exists activated_at;
