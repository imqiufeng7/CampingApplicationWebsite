-- Core schema for the camping/event registration system.
-- Hierarchy: event_series -> event_sessions -> registrations -> registration_members

-- Supabase pre-installs extensions into an `extensions` schema by default (not
-- `public`), which would make every unqualified pgcrypto call below (gen_random_bytes,
-- pgp_sym_encrypt/decrypt, hmac) fail to resolve unless `extensions` happens to be on
-- the caller's search_path. Force it into `public` so this migration and every
-- function that follows can call these functions unqualified, deterministically,
-- regardless of how the project was provisioned.
drop extension if exists pgcrypto;
create extension pgcrypto with schema public;

-- Private schema: never exposed via PostgREST (only public/graphql_public are, per supabase/config.toml).
-- Used to hold the symmetric key used for id_number encryption/hashing so it's unreachable
-- even from a compromised SECURITY DEFINER function signature mistake elsewhere.
create schema if not exists private;

-- Placeholder secret. MUST be rotated before production use:
--   select private.set_id_number_key('a-long-random-secret');
create table private.app_secrets (
  name text primary key,
  value text not null
);

insert into private.app_secrets (name, value)
values ('id_number_key', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function private.id_number_key()
returns text
language sql
stable
security definer
set search_path = private
as $$
  select value from private.app_secrets where name = 'id_number_key';
$$;

create or replace function private.set_id_number_key(new_key text)
returns void
language sql
security definer
set search_path = private
as $$
  insert into private.app_secrets (name, value)
  values ('id_number_key', new_key)
  on conflict (name) do update set value = excluded.value;
$$;

-- ---------------------------------------------------------------------------
-- event_series
-- ---------------------------------------------------------------------------
create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- event_sessions
-- ---------------------------------------------------------------------------
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.event_series(id) on delete cascade,
  name text not null,
  location text,
  date_start date,
  date_end date,
  capacity_total int,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  result_announce_at timestamptz,
  cancel_deadline_at timestamptz,
  fee_base numeric(10, 2) not null default 0,
  fee_discount_per_person numeric(10, 2) not null default 0,
  max_members_per_registration int not null default 1 check (max_members_per_registration >= 1),
  managing_org text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_sessions_series_id on public.event_sessions(series_id);

-- ---------------------------------------------------------------------------
-- session_identity_types (身分別設定)
-- ---------------------------------------------------------------------------
create table public.session_identity_types (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  name text not null,
  requires_org_field boolean not null default false,
  org_options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_session_identity_types_session_id on public.session_identity_types(session_id);

-- ---------------------------------------------------------------------------
-- session_fee_categories (免付費/減免資格分類)
-- ---------------------------------------------------------------------------
create table public.session_fee_categories (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  code text,
  label text not null,
  discount_amount numeric(10, 2) not null default 0,
  required_document_type text,
  applies_to text not null default '減免' check (applies_to in ('免付費', '減免')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_session_fee_categories_session_id on public.session_fee_categories(session_id);

-- ---------------------------------------------------------------------------
-- registrations (一筆＝一組)
-- ---------------------------------------------------------------------------
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete restrict,
  contact_email text not null,
  contact_phone text not null,
  submitted_at timestamptz not null default now(),

  review_status text not null default '審核中' check (review_status in ('審核中', '審核通過', '退回補件')),
  admission_status text not null default '未抽籤' check (admission_status in ('未抽籤', '正取', '備取', '取消')),
  waitlist_rank int,

  payment_status text not null default '無需繳費' check (payment_status in ('無需繳費', '待繳費', '已完成')),
  payment_amount numeric(10, 2) not null default 0,
  payment_method text check (payment_method in ('online', 'manual')),
  ecpay_trade_no text,
  ecpay_link text,
  -- Our own outbound MerchantTradeNo (distinct from ecpay_trade_no, which is ECPay's
  -- TradeNo returned in the webhook). Persisted so the webhook can look the
  -- registration back up — it's derived from the registration id but truncated to
  -- fit ECPay's 20-char limit, so it can't be reversed back to a uuid without storing it.
  ecpay_merchant_trade_no text unique,
  manual_transfer_last5 text,
  manual_transfer_note text,

  group_zone text,
  group_number text,
  tent_type text,
  sleeping_bag_own_qty int not null default 0,
  sleeping_bag_rent_qty int not null default 0,

  is_cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount numeric(10, 2),
  refund_status text check (refund_status in ('待退', '已退')),

  -- Deferred feature (duplicate-registration detection logic) — column kept so the
  -- feature can be added later without a destructive migration.
  duplicate_flag boolean not null default false,
  duplicate_note text,

  -- Deferred feature (QR check-in)
  checkin_at timestamptz,
  checkin_by uuid references auth.users(id) on delete set null,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),

  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_registrations_session_id on public.registrations(session_id);
create index idx_registrations_payment_status on public.registrations(session_id, payment_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_registrations_updated_at
  before update on public.registrations
  for each row
  execute function public.set_updated_at();

create trigger trg_event_series_updated_at
  before update on public.event_series
  for each row
  execute function public.set_updated_at();

create trigger trg_event_sessions_updated_at
  before update on public.event_sessions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- registration_members (含聯絡人本人 member_order = 0)
-- ---------------------------------------------------------------------------
create table public.registration_members (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  member_order int not null default 0,
  name text not null,
  id_number_encrypted bytea,
  -- Deterministic HMAC of the plaintext ID number, used only for future duplicate-
  -- registration matching (pgp_sym_encrypt output is non-deterministic so it can't be
  -- compared directly). Never expose this column via the API.
  id_number_hash text,
  household_address text,
  birth_year_roc int,
  gender text,
  identity_type_id uuid references public.session_identity_types(id) on delete set null,
  org_selected text,
  org_other_text text,
  fee_category_id uuid references public.session_fee_categories(id) on delete set null,
  fee_review_result text not null default '審核中' check (fee_review_result in ('審核中', '審核通過', '需繳費', '無需繳費')),
  -- Deferred feature (OCR pre-fill)
  ocr_extracted_text jsonb,
  created_at timestamptz not null default now(),
  unique (registration_id, member_order)
);

create index idx_registration_members_registration_id on public.registration_members(registration_id);
create index idx_registration_members_name on public.registration_members(name);
create index idx_registration_members_id_number_hash on public.registration_members(id_number_hash);

-- ---------------------------------------------------------------------------
-- registration_files
-- ---------------------------------------------------------------------------
create table public.registration_files (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  member_id uuid references public.registration_members(id) on delete set null,
  file_type text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  -- Deferred feature (OCR)
  ocr_status text,
  ocr_result jsonb
);

create index idx_registration_files_registration_id on public.registration_files(registration_id);

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null check (role in ('vendor', 'host_org', 'finance')),
  managed_session_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_admin_users_managed_session_ids on public.admin_users using gin (managed_session_ids);

-- ---------------------------------------------------------------------------
-- email_logs
-- ---------------------------------------------------------------------------
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  type text not null check (type in ('審核結果', '付款通知', '場次資訊', '報到QR', '遞補通知')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_email_logs_registration_id on public.email_logs(registration_id);

-- ---------------------------------------------------------------------------
-- duplicate_matches (deferred feature — table kept ready)
-- ---------------------------------------------------------------------------
create table public.duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  registration_id_a uuid not null references public.registrations(id) on delete cascade,
  registration_id_b uuid not null references public.registrations(id) on delete cascade,
  matched_by text,
  diff_summary jsonb,
  resolved boolean not null default false,
  resolved_note text,
  created_at timestamptz not null default now()
);

create index idx_duplicate_matches_registration_id_a on public.duplicate_matches(registration_id_a);
create index idx_duplicate_matches_registration_id_b on public.duplicate_matches(registration_id_b);
