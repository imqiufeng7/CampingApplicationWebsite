-- 20260731090001 created admin_roles without enabling RLS on it at all — an
-- oversight caught before any app code depended on it. Any authenticated admin needs
-- to read role labels/keys (nav, session lookup, role pickers); only vendor may
-- create/rename/delete roles.
alter table public.admin_roles enable row level security;

create policy admin_select_admin_roles on public.admin_roles
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy vendor_write_admin_roles on public.admin_roles
  for insert to authenticated
  with check (public.current_admin_role() = 'vendor');

create policy vendor_update_admin_roles on public.admin_roles
  for update to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor' and is_system = false);

-- is_system rows (vendor) can never be deleted; non-system rows only by vendor.
create policy vendor_delete_admin_roles on public.admin_roles
  for delete to authenticated
  using (public.current_admin_role() = 'vendor' and is_system = false);
