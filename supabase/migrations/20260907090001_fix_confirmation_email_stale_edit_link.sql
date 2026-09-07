-- 20260903090001 locked the edit link by default and moved the "報名確認" email over to
-- a plain 查詢連結 (buildRegistrationConfirmationVars no longer even builds a 修改連結
-- var) — but the *live* email_templates row for 報名確認 was seeded back on 2026-08-20
-- and never retrofitted, so every confirmation email still went out with a literal
-- unresolved "{{修改連結}}" placeholder and a now-false privacy warning claiming anyone
-- holding that link could edit/delete the registration. Guarded on still containing
-- {{修改連結}} so this is a no-op if the row was already fixed some other way.
update public.email_templates
set body_template = '{{第一位成員姓名}} 您好，以下是您的報名資料副本：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}
聯絡 Email：{{聯絡Email}}
聯絡電話：{{聯絡電話}}

成員名單：
{{成員名單}}

如發現資料有誤，請洽詢主辦單位協助修改。

審核結果公布後，可至以下連結查詢：
{{查詢連結}}

如有任何疑問，請洽詢主辦單位。
',
    updated_at = now()
where type = '報名確認' and body_template like '%{{修改連結}}%';

update public.session_email_templates
set body_template = '{{第一位成員姓名}} 您好，以下是您的報名資料副本：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}
聯絡 Email：{{聯絡Email}}
聯絡電話：{{聯絡電話}}

成員名單：
{{成員名單}}

如發現資料有誤，請洽詢主辦單位協助修改。

審核結果公布後，可至以下連結查詢：
{{查詢連結}}

如有任何疑問，請洽詢主辦單位。
'
where type = '報名確認' and body_template like '%{{修改連結}}%';
