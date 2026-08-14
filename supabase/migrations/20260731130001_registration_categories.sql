-- Opt-in per-session registration categories (e.g. 自搭帳篷 / 主辦搭設2人室內帳 /
-- 主辦搭設4人室外帳), each with its own capacity/admission-quota/member-cap. A session
-- with zero rows here behaves exactly as before — capacity_total/admission_quota/
-- max_members_per_registration on event_sessions keep governing it unchanged.
create table public.session_registration_categories (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  label text not null,
  max_members int not null default 1 check (max_members >= 1),
  capacity_total int,
  admission_quota int,
  -- self-pitch tents: the whole registration is free, so the public form skips fee
  -- category selection and document upload entirely for every member in the group.
  is_free boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_session_registration_categories_session_id
  on public.session_registration_categories(session_id);

alter table public.session_registration_categories enable row level security;

create policy admin_select_session_registration_categories on public.session_registration_categories
  for select to authenticated
  using (public.current_admin_role() is not null);

create policy anon_select_open_session_registration_categories on public.session_registration_categories
  for select to anon
  using (exists (
    select 1 from public.event_sessions es
    where es.id = session_registration_categories.session_id and es.status = 'open'
  ));

create policy vendor_write_session_registration_categories on public.session_registration_categories
  for all to authenticated
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

-- Immutable once set (no UPDATE policy needed beyond vendor's own, and it's never
-- touched by fn_update_registration_via_token) — a registration can't switch category
-- after submission, same principle as "can't change which session it belongs to".
alter table public.registrations
  add column registration_category_id uuid references public.session_registration_categories(id) on delete restrict;
