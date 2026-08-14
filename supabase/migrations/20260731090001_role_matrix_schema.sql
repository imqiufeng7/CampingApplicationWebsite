-- Replaces the hardcoded 3-role model with a dynamic admin_roles table plus a
-- per-role field_permission_matrix (editable/readonly/hidden per field group).
-- vendor stays a protected, non-deletable system role — it's the one role name
-- still compared literally anywhere in the app (system administration pages),
-- everything else about a role is now data, not code.

create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.admin_roles (key, label, is_system) values
  ('vendor', '廠商', true),
  ('host_org', '主辦機關', false),
  ('finance', '財務', false);

create table public.field_permission_matrix (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  field_group text not null check (field_group in (
    '個人基本資料', '身份證明文件', '免付費審核結果',
    '錄取分組結果', '繳費狀態', '取消退費資訊', '備註'
  )),
  permission text not null default 'hidden' check (permission in ('editable', 'readonly', 'hidden')),
  unique (role_id, field_group)
);

alter table public.field_permission_matrix enable row level security;

create policy vendor_all_field_permission_matrix on public.field_permission_matrix
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

-- admin_users.role (text) -> admin_users.role_id (fk). Backfill by matching the old
-- literal value to admin_roles.key, then drop the old column — nothing else in the
-- schema depends on it once current_admin_role() (next) is repointed at role_id.
alter table public.admin_users add column role_id uuid references public.admin_roles(id);

update public.admin_users au
set role_id = ar.id
from public.admin_roles ar
where ar.key = au.role;

alter table public.admin_users alter column role_id set not null;
alter table public.admin_users drop column role;

-- current_admin_role() keeps its exact signature and semantics (still returns the
-- role's text key) so the ~10 existing RLS policies elsewhere that compare it to
-- 'vendor' need zero changes. Only its body now joins through admin_roles.
create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ar.key
  from public.admin_users au
  join public.admin_roles ar on ar.id = au.role_id
  where au.id = auth.uid();
$$;

create or replace function public.current_admin_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select role_id from public.admin_users where id = auth.uid();
$$;

grant execute on function public.current_admin_role_id() to anon, authenticated;

-- Single source of truth for "what can this field group do for the caller".
-- vendor and service-role connections (current_admin_role() is null, e.g. the ECPay
-- webhook / email batch job) always get 'editable' — same bypass philosophy as the
-- column-permission triggers. Any other role/group combo with no matrix row fails
-- closed to 'hidden'.
create or replace function public.field_permission(p_field_group text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_admin_role() is null or public.current_admin_role() = 'vendor' then 'editable'
    else coalesce(
      (select permission from public.field_permission_matrix
       where role_id = public.current_admin_role_id() and field_group = p_field_group),
      'hidden'
    )
  end;
$$;

grant execute on function public.field_permission(text) to anon, authenticated;

-- One round trip for the app to read every group's permission for the current admin.
create or replace function public.current_field_permissions()
returns table (field_group text, permission text)
language sql
stable
security definer
set search_path = public
as $$
  select g.field_group, public.field_permission(g.field_group)
  from unnest(array[
    '個人基本資料', '身份證明文件', '免付費審核結果',
    '錄取分組結果', '繳費狀態', '取消退費資訊', '備註'
  ]) as g(field_group);
$$;

grant execute on function public.current_field_permissions() to anon, authenticated;

-- Seed matrix rows that exactly reproduce today's hardcoded host_org_cols/finance_cols
-- behavior (see 20260727100003_column_permission_triggers.sql), so this migration is a
-- pure refactor with zero behavior change until vendor edits something via the new
-- permissions page.
insert into public.field_permission_matrix (role_id, field_group, permission)
select ar.id, v.field_group, v.permission
from public.admin_roles ar
join (values
  ('host_org', '錄取分組結果', 'editable'),
  ('host_org', '取消退費資訊', 'editable'),
  ('host_org', '備註', 'editable'),
  ('host_org', '免付費審核結果', 'editable'),
  ('host_org', '個人基本資料', 'editable'),
  ('host_org', '身份證明文件', 'editable'),
  ('host_org', '繳費狀態', 'readonly'),
  ('finance', '繳費狀態', 'editable'),
  ('finance', '身份證明文件', 'readonly'),
  ('finance', '個人基本資料', 'readonly'),
  ('finance', '錄取分組結果', 'readonly'),
  ('finance', '取消退費資訊', 'readonly'),
  ('finance', '免付費審核結果', 'readonly'),
  ('finance', '備註', 'readonly')
) as v(role_key, field_group, permission) on v.role_key = ar.key;
