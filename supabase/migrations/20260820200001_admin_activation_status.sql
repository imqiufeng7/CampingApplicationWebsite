-- "有沒有完成密碼設定" has no existing signal to answer from — auth.users.last_sign_in_at
-- gets stamped the moment an invite/magiclink token is *verified* (see the comment on
-- sendAccountSetupLink in admins/actions.ts), which happens before the person ever
-- reaches the password form, so it can't tell "clicked the link" apart from "actually
-- finished setting a password". A dedicated column set only at the end of that flow
-- (app/admin/accept-invite/page.tsx's onSubmit, right after updateUser({password})
-- succeeds) is unambiguous.
alter table public.admin_users add column activated_at timestamptz;

create or replace function public.mark_admin_activated()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_users set activated_at = now()
  where id = auth.uid() and activated_at is null;
end;
$$;

grant execute on function public.mark_admin_activated() to authenticated;
