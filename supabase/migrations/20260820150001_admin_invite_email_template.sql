-- Two asks from the vendor: (1) prepend the first member's name before "您好" in the
-- 報名確認 email, (2) make the admin-team invite email editable like the other four.

-- (1) Retrofit the live 報名確認 row (and any per-session overrides, though none exist
-- today) rather than overwriting it outright — the vendor already hand-edited this
-- row's body (it mentions the self-service delete link added later), so a blind
-- overwrite with the TS default would silently discard that customization. The
-- replace() only targets this exact known opening sentence, so it's a no-op on rows
-- that don't contain it and safe to re-run (idempotent — the NOT LIKE guard skips rows
-- that already carry the placeholder).
update public.email_templates
set body_template = replace(
  body_template,
  '您好，以下是您的報名資料副本',
  '{{第一位成員姓名}} 您好，以下是您的報名資料副本'
)
where type = '報名確認' and body_template not like '%{{第一位成員姓名}}%';

update public.session_email_templates
set body_template = replace(
  body_template,
  '您好，以下是您的報名資料副本',
  '{{第一位成員姓名}} 您好，以下是您的報名資料副本'
)
where type = '報名確認' and body_template not like '%{{第一位成員姓名}}%';

-- (2) 管理員邀請: unlike the other editable types, this one has no event_sessions
-- context at all (inviting someone to the admin team isn't tied to any session), so
-- it's added only to email_templates' check constraint — not session_email_templates,
-- which has no legitimate per-session override use for it.
alter table public.email_templates drop constraint email_templates_type_check;
alter table public.email_templates add constraint email_templates_type_check
  check (type in (
    '報名確認', '審核結果', '審核結果-正取', '審核結果-備取', '退回補件', '管理員邀請'
  ));

insert into public.email_templates (type, subject_template, body_template) values
(
  '管理員邀請',
  '【報名系統後台】您已受邀加入管理團隊',
  '您好，

您已被邀請加入報名系統後台，角色為「{{角色}}」。

請點擊以下連結設定登入密碼並開始使用：
{{設定連結}}

請妥善保存此連結，勿轉發給他人。若非本人申請，請忽略此信。
'
)
on conflict (type) do nothing;
