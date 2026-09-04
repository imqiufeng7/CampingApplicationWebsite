-- The lookup page reads registrations.review_status/admission_status directly, but
-- those are updated live as staff review — the vendor wants the public page to keep
-- showing "審核中" until the official 審核結果 batch/resend email actually goes out for
-- that registration, not the moment a reviewer's click updates the row. result_published_at
-- is that separate, deliberate gate: null until an email actually sends successfully.
alter table public.registrations
  add column result_published_at timestamptz;

create or replace function public.fn_lookup_registration_result(p_email text, p_registration_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_registration record;
  v_session record;
  v_published boolean;
  v_review_status text;
  v_admission_status text;
  v_waitlist_rank int;
  v_payment_status text;
  v_payment_amount numeric;
  v_payment_method text;
  v_payment_deadline timestamptz;
  v_result jsonb;
begin
  if not public.fn_check_rate_limit('lookup:' || coalesce(public.fn_client_ip(), 'unknown'), 20, 600) then
    raise exception 'too many lookup attempts, please try again later' using errcode = '55000';
  end if;

  v_seq := nullif(regexp_replace(coalesce(p_registration_no, ''), '\D', '', 'g'), '')::bigint;
  if v_seq is null or coalesce(p_email, '') = '' then
    return null;
  end if;

  select r.* into v_registration
  from public.registrations r
  where r.registration_seq = v_seq
    and lower(r.contact_email) = lower(p_email)
    and r.is_cancelled = false;

  if not found then
    return null;
  end if;

  select * into v_session from public.event_sessions where id = v_registration.session_id;

  -- 退回補件 is an in-progress, actionable state (the registrant needs to fix
  -- something) rather than "the result", so it always shows immediately regardless of
  -- the publish gate. Everything else that would reveal an admission/payment
  -- determination — 審核通過 with any admission_status, or payment fields, or a
  -- waitlist rank — stays forced to the pending/未公布 shape until published.
  v_published := v_registration.result_published_at is not null;
  if v_published or v_registration.review_status = '退回補件' then
    v_review_status := v_registration.review_status;
    v_admission_status := v_registration.admission_status;
    v_waitlist_rank := v_registration.waitlist_rank;
    v_payment_status := v_registration.payment_status;
    v_payment_amount := v_registration.payment_amount;
    v_payment_method := v_registration.payment_method;
    v_payment_deadline := v_registration.payment_deadline;
  else
    v_review_status := '審核中';
    v_admission_status := '待確認';
    v_waitlist_rank := null;
    v_payment_status := '無需繳費';
    v_payment_amount := 0;
    v_payment_method := null;
    v_payment_deadline := null;
  end if;

  select jsonb_build_object(
    'registration_id', v_registration.id,
    'registration_no', 'R' || lpad(v_registration.registration_seq::text, 6, '0'),
    'session_name', v_session.name,
    'session_date_start', v_session.date_start,
    'session_date_end', v_session.date_end,
    'result_announce_at', v_session.result_announce_at,
    'fee_discount_per_person', v_session.fee_discount_per_person,
    'review_status', v_review_status,
    'admission_status', v_admission_status,
    'waitlist_rank', v_waitlist_rank,
    'payment_status', v_payment_status,
    'payment_amount', v_payment_amount,
    'payment_method', v_payment_method,
    'payment_deadline', v_payment_deadline,
    'members', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', rm.name,
          'fee_review_result', case when v_published then rm.fee_review_result else '審核中' end,
          'fee_category_label', case
            when not v_published then null
            when sfc.id is null then null
            when sfc.code is not null then sfc.code || ' ' || sfc.label
            else sfc.label
          end
        )
        order by rm.member_order
      ), '[]'::jsonb)
      from public.registration_members rm
      left join public.session_fee_categories sfc on sfc.id = rm.fee_category_id
      where rm.registration_id = v_registration.id
    )
  ) into v_result;

  return v_result;
end;
$$;
