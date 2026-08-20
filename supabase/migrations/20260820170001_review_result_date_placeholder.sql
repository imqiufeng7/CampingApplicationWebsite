-- The vendor already hand-typed the actual date range into the live 審核結果-正取
-- body ("11月15日(星期六)至11月16日(星期日)") as a placeholder for what they wanted to
-- be a real per-session variable. Swap that exact hardcoded text for {{活動日期}} so
-- their already-written content starts working instead of asking them to redo it —
-- same targeted-replace approach as 20260820150001/20260820160001, not a rewrite.
update public.email_templates
set body_template = replace(
  body_template,
  '11月15日(星期六)至11月16日(星期日)',
  '{{活動日期}}'
)
where type = '審核結果-正取' and body_template like '%11月15日(星期六)至11月16日(星期日)%';

update public.session_email_templates
set body_template = replace(
  body_template,
  '11月15日(星期六)至11月16日(星期日)',
  '{{活動日期}}'
)
where type = '審核結果-正取' and body_template like '%11月15日(星期六)至11月16日(星期日)%';
