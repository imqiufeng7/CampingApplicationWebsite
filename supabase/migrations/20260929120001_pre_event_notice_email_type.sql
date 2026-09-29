-- Allow logging the 行前通知 (pre-event notice) batch in email_logs.
alter table public.email_logs drop constraint email_logs_type_check;
alter table public.email_logs add constraint email_logs_type_check check (
  type = any (array[
    '審核結果', '審核結果-正取', '審核結果-備取', '付款通知', '場次資訊', '報到QR',
    '遞補通知', '報名確認', '退回補件', '行前通知'
  ])
);
