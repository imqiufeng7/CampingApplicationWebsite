-- 20260820180001 added log_type defaulting every existing row to 'change', which was
-- correct for genuine edit-history rows but wrong for the身分證 view-log rows that
-- already existed from before that migration — they got backfilled as 'change' too,
-- so they kept showing up in the main 異動紀錄 feed instead of moving to the new
-- separate 身分證查看紀錄 one. Their summary text has a fixed, distinctive format (see
-- the format() call in fn_get_registration_member_id_number) that nothing else in this
-- table produces, so it's a safe, precise way to reclassify just these rows.
update public.admin_activity_log
set log_type = 'view'
where log_type = 'change'
  and summary like '報名 #%：查看成員「%」身分證字號';
