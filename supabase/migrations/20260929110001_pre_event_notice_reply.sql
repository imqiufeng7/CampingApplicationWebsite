-- 行前通知 reply: the pre-event notice email carries a per-registration link where the
-- group confirms attendance (and, for 自搭帳, gives the licence plate of the vehicle
-- that unloads their tent). A dedicated token rather than edit_token (grants editing)
-- or qr_token (check-in) so this link can't be used for anything else.
alter table public.registrations
  add column notice_token uuid not null default gen_random_uuid(),
  add column notice_replied_at timestamptz,
  add column notice_plate_number text;

create unique index registrations_notice_token_key on public.registrations (notice_token);

-- 公所聯絡資訊 quoted at the end of the notice ("因故無法參與者，請務必於活動前電洽…").
alter table public.event_sessions add column office_contact text;

-- Everything the public reply page needs, and nothing else — no email/phone/ID.
create or replace function public.fn_get_notice_reply(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'registration_no', 'R' || lpad(r.registration_seq::text, 6, '0'),
    'session_name', s.name,
    'location', s.location,
    'date_start', s.date_start,
    'date_end', s.date_end,
    'theme_color', s.theme_color,
    'category_label', rc.label,
    'self_pitch', coalesce(rc.is_free, false),
    'leader_name', (
      select m.name from public.registration_members m
      where m.registration_id = r.id order by m.member_order limit 1
    ),
    'member_count', (select count(*) from public.registration_members m where m.registration_id = r.id),
    'group_zone', r.group_zone,
    'group_number', r.group_number,
    'replied_at', r.notice_replied_at,
    'plate_number', r.notice_plate_number,
    'eligible', (
      not r.is_cancelled
      and r.admission_status = '正取'
      and r.payment_status in ('已完成', '無需繳費')
    )
  )
  from public.registrations r
  join public.event_sessions s on s.id = r.session_id
  left join public.session_registration_categories rc on rc.id = r.registration_category_id
  where r.notice_token = p_token;
$$;

create or replace function public.fn_submit_notice_reply(p_token uuid, p_plate_number text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_self_pitch boolean;
  v_plate text := nullif(upper(regexp_replace(coalesce(p_plate_number, ''), '\s', '', 'g')), '');
  v_now timestamptz := now();
begin
  select r.id, r.is_cancelled, r.admission_status, r.payment_status, coalesce(rc.is_free, false) as self_pitch
  into v_registration
  from public.registrations r
  left join public.session_registration_categories rc on rc.id = r.registration_category_id
  where r.notice_token = p_token
  for update of r;

  if not found then
    raise exception 'invalid token' using errcode = 'P0002';
  end if;

  if v_registration.is_cancelled
    or v_registration.admission_status <> '正取'
    or v_registration.payment_status not in ('已完成', '無需繳費') then
    raise exception 'registration is not eligible for the pre-event notice' using errcode = '22023';
  end if;

  v_self_pitch := v_registration.self_pitch;
  if v_self_pitch and v_plate is null then
    raise exception 'plate number is required' using errcode = '22023';
  end if;
  if v_plate is not null and length(v_plate) > 20 then
    raise exception 'plate number too long' using errcode = '22023';
  end if;

  -- Internal write on behalf of an anonymous token holder — same bypass the payment
  -- recompute trigger uses to get past the column-permission trigger.
  perform set_config('app.bypass_column_check', 'true', true);
  update public.registrations
  set notice_replied_at = v_now,
      notice_plate_number = case when v_self_pitch then v_plate else notice_plate_number end
  where id = v_registration.id;
  perform set_config('app.bypass_column_check', 'false', true);

  return v_now;
end;
$$;

revoke all on function public.fn_get_notice_reply(uuid) from public;
revoke all on function public.fn_submit_notice_reply(uuid, text) from public;
grant execute on function public.fn_get_notice_reply(uuid) to anon, authenticated;
grant execute on function public.fn_submit_notice_reply(uuid, text) to anon, authenticated;
