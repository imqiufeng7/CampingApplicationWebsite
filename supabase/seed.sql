-- Local-dev-only sample data so M3/M4 can be exercised without clicking through the
-- admin UI first. Not applied to the hosted project by `supabase db push`.

insert into public.event_series (id, name, year, status)
values ('00000000-0000-0000-0000-000000000001', '114年防災教育日系列活動', 2025, 'open')
on conflict (id) do nothing;

insert into public.event_sessions (
  id, series_id, name, location, date_start, date_end, capacity_total,
  registration_open_at, registration_close_at, result_announce_at, cancel_deadline_at,
  fee_base, fee_discount_per_person, max_members_per_registration, managing_org, status
)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '和美場-主辦搭設帳', '和美運動公園',
  current_date + 30, current_date + 31,
  200,
  now() - interval '1 day', now() + interval '30 days',
  now() + interval '35 days', now() + interval '25 days',
  500, 100, 4, '和美鎮公所', 'open'
)
on conflict (id) do nothing;

insert into public.session_identity_types (session_id, name, requires_org_field, org_options, sort_order)
values
  ('00000000-0000-0000-0000-000000000002', '工作人員', true,
    '["公所", "消防局", "社會處", "衛生局", "警察局", "社區", "民間團體", "其他"]'::jsonb, 0),
  ('00000000-0000-0000-0000-000000000002', '民眾', false, '[]'::jsonb, 1)
on conflict do nothing;

insert into public.session_fee_categories (session_id, code, label, discount_amount, required_document_type, applies_to, sort_order)
values
  ('00000000-0000-0000-0000-000000000002', '(一)', '低收入戶', 500, '低收入戶證明', '免付費', 0),
  ('00000000-0000-0000-0000-000000000002', '(二)', '身心障礙人士', 100, '身心障礙證明', '減免', 1)
on conflict do nothing;
