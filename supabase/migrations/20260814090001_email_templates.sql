-- Editable email content: a global default per email type, optionally overridden
-- per session. Only the two email types the system actually sends automatically
-- today ("報名確認" right after submission, "審核結果" from the batch send-results
-- flow) — the other three values already allowed in email_logs.type ("付款通知" /
-- "場次資訊" / "報到QR" / "遞補通知") have no trigger code yet, so there's nothing to
-- make editable for them until that code exists.
--
-- System-computed blocks (member list, edit link, payment info, admission-status
-- sentence) stay out of the editable text and are substituted in via {{placeholder}}
-- tokens at send time — the same convention session_registration_categories'
-- sibling features already use (see ConsentGate's {{活動名稱}} substitution).

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null unique check (type in ('報名確認', '審核結果')),
  subject_template text not null,
  body_template text not null,
  updated_at timestamptz not null default now()
);

create table public.session_email_templates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  type text not null check (type in ('報名確認', '審核結果')),
  subject_template text not null,
  body_template text not null,
  created_at timestamptz not null default now(),
  unique (session_id, type)
);

create index idx_session_email_templates_session_id on public.session_email_templates(session_id);

alter table public.email_templates enable row level security;
alter table public.session_email_templates enable row level security;

-- Vendor-only, same shape as session_fee_categories' policies: vendor manages
-- everything, no other role needs to read or write template text. The actual send
-- routes run under the service-role client and bypass RLS entirely.
create policy vendor_all_email_templates on public.email_templates
  for all
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

create policy vendor_all_session_email_templates on public.session_email_templates
  for all
  using (public.current_admin_role() = 'vendor')
  with check (public.current_admin_role() = 'vendor');

insert into public.email_templates (type, subject_template, body_template) values
(
  '報名確認',
  '【{{活動名稱}}】報名資料確認（編號 {{報名編號}}）',
  '您好，以下是您的報名資料副本：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}
聯絡 Email：{{聯絡Email}}
聯絡電話：{{聯絡電話}}

成員名單：
{{成員名單}}

若發現資料有誤（例如上傳的證件檔案不清楚），可透過以下專屬連結自行修改：
{{修改連結}}

請妥善保存此連結，勿轉發給他人，任何人持有此連結皆可修改您的報名資料。

如有任何疑問，請洽詢主辦單位。
'
),
(
  '審核結果',
  '【{{活動名稱}}】報名審核結果通知',
  '{{錄取結果}}

活動場次：{{活動名稱}}

成員審核結果：
{{成員審核結果}}

繳費資訊：
{{繳費資訊}}
'
);
