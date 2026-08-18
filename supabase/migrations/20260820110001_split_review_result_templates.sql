-- Splits the single "審核結果" email template into two independently-editable
-- templates — 審核結果-正取 (admitted) and 審核結果-備取 (waitlisted) — so the vendor
-- can write genuinely different content for each instead of relying on the one
-- system-computed {{錄取結果}} line to carry the distinction. The old '審核結果' row is
-- left in place (harmless, and historical email_logs rows already reference it by
-- name) but is no longer written to by app code after this change.

-- Bug fix found while wiring this up: email_logs_type_check was never updated when
-- 退回補件 became a valid email_templates type (20260817090001_review_workflow_and_
-- activity_log.sql touched email_templates_type_check and session_email_templates_
-- type_check but not this one) — confirmed live via a direct insert that every
-- 退回補件 notification's email_logs row has been silently rejected ever since
-- (sendResubmissionRequestEmail in lib/email/sendResubmissionRequest.ts never checks
-- this insert's own error, only the email adapter's send result, so the failure was
-- completely invisible: the email itself still went out, it just never showed up in
-- the registration's 通知寄送紀錄).
alter table public.email_logs drop constraint email_logs_type_check;
alter table public.email_logs add constraint email_logs_type_check
  check (type in (
    '審核結果', '審核結果-正取', '審核結果-備取',
    '付款通知', '場次資訊', '報到QR', '遞補通知', '報名確認', '退回補件'
  ));

alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates add constraint email_templates_type_check
  check (type in ('報名確認', '審核結果', '審核結果-正取', '審核結果-備取', '退回補件'));

alter table public.session_email_templates drop constraint session_email_templates_type_check;
alter table public.session_email_templates add constraint session_email_templates_type_check
  check (type in ('報名確認', '審核結果', '審核結果-正取', '審核結果-備取', '退回補件'));

insert into public.email_templates (type, subject_template, body_template) values
(
  '審核結果-正取',
  '【{{活動名稱}}】恭喜您已錄取本次活動',
  '{{錄取結果}}

活動場次：{{活動名稱}}

成員審核結果：
{{成員審核結果}}

繳費資訊：
{{繳費資訊}}
'
),
(
  '審核結果-備取',
  '【{{活動名稱}}】您目前為備取名單',
  '{{錄取結果}}

活動場次：{{活動名稱}}

成員審核結果：
{{成員審核結果}}

繳費資訊：
{{繳費資訊}}
'
);
