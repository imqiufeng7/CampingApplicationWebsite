-- Prepend {{姓名}} before "您好" in the 管理員邀請 email, same treatment as
-- 20260820150001 gave 報名確認 — a targeted replace() rather than an overwrite, in case
-- the vendor already edited this row in the short window since it was seeded.
update public.email_templates
set body_template = replace(
  body_template,
  '您好，

您已被邀請加入報名系統後台',
  '{{姓名}} 您好，

您已被邀請加入報名系統後台'
)
where type = '管理員邀請' and body_template not like '%{{姓名}}%';
