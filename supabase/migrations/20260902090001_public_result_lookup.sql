-- Public self-service "查詢報名結果" lookup — registrations has intentionally no
-- SELECT policy for anon (see 20260727100002_rls_policies.sql), so this is a narrow
-- SECURITY DEFINER function rather than a relaxed RLS policy: it takes email +
-- registration number as the credential pair (both are values only the registrant
-- themselves would have — the email they submitted with, and the number from their
-- confirmation email) and returns only the fields needed to show a result, nothing
-- else (no id_number, no household_address, no raw file paths). Rate-limited the same
-- way fn_submit_registration is, since registration_no is a small guessable sequence
-- and this must not become a way to enumerate someone's email against random numbers.
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

  select jsonb_build_object(
    'registration_id', v_registration.id,
    'registration_no', 'R' || lpad(v_registration.registration_seq::text, 6, '0'),
    'session_name', v_session.name,
    'session_date_start', v_session.date_start,
    'session_date_end', v_session.date_end,
    'result_announce_at', v_session.result_announce_at,
    'fee_discount_per_person', v_session.fee_discount_per_person,
    'review_status', v_registration.review_status,
    'admission_status', v_registration.admission_status,
    'waitlist_rank', v_registration.waitlist_rank,
    'payment_status', v_registration.payment_status,
    'payment_amount', v_registration.payment_amount,
    'payment_method', v_registration.payment_method,
    'payment_deadline', v_registration.payment_deadline,
    'members', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'name', rm.name,
          'fee_review_result', rm.fee_review_result,
          'fee_category_label', case
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

grant execute on function public.fn_lookup_registration_result(text, text) to anon, authenticated;
