-- PDPA 第10/11條 self-service deletion right, exercised through the existing
-- edit-token mechanism (same token already used for self-service viewing/editing —
-- no new auth model needed). Scope is deliberately narrow: only while the
-- registration is still 待確認 (results not yet announced) and payment isn't 已完成,
-- since once either of those happens the record is tied to financial reconciliation /
-- an announced outcome and PDPA Art.11's "履行法定義務所必要" exception covers
-- retaining it — deletion past that point goes through the organizer instead.

-- payment_status/admission_status weren't previously exposed through the edit-token
-- RPC (the edit form itself never needed them) — added so the public page can decide
-- whether to show the delete option without a second round trip.
create or replace function public.fn_get_registration_for_edit(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_result jsonb;
begin
  select * into v_registration
  from public.registrations
  where edit_token = p_token;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'registration_id', v_registration.id,
    'session_id', v_registration.session_id,
    'registration_category_id', v_registration.registration_category_id,
    'registration_no', 'R' || lpad(v_registration.registration_seq::text, 6, '0'),
    'contact_email', v_registration.contact_email,
    'contact_phone', v_registration.contact_phone,
    'is_cancelled', v_registration.is_cancelled,
    'payment_status', v_registration.payment_status,
    'admission_status', v_registration.admission_status,
    'members', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'member_id', rm.id,
          'member_order', rm.member_order,
          'name', rm.name,
          'id_number', case when rm.id_number_encrypted is not null
            then pgp_sym_decrypt(rm.id_number_encrypted, private.id_number_key())
            else null end,
          'household_address', rm.household_address,
          'birth_year_roc', rm.birth_year_roc,
          'birth_month', rm.birth_month,
          'birth_day', rm.birth_day,
          'gender', rm.gender,
          'identity_type_id', rm.identity_type_id,
          'org_selected', rm.org_selected,
          'org_other_text', rm.org_other_text,
          'fee_category_id', rm.fee_category_id,
          'files', (
            select coalesce(jsonb_agg(
              jsonb_build_object('id', rf.id, 'file_type', rf.file_type, 'storage_path', rf.storage_path)
            ), '[]'::jsonb)
            from public.registration_files rf
            where rf.member_id = rm.id
          )
        )
        order by rm.member_order
      ), '[]'::jsonb)
      from public.registration_members rm
      where rm.registration_id = v_registration.id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- The real enforcement boundary — the app-layer UI check is just a courtesy, this is
-- what actually decides whether a delete-by-token succeeds. Rate-limited the same way
-- as submission (an edit_token is unguessable, but this still bounds brute-force
-- token-guessing attempts against the delete path specifically).
create or replace function public.fn_delete_registration_via_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
begin
  if not public.fn_check_rate_limit('delete_token:' || coalesce(public.fn_client_ip(), 'unknown'), 10, 600) then
    raise exception 'too many requests, please try again later' using errcode = '55000';
  end if;

  select * into v_registration
  from public.registrations
  where edit_token = p_token
  for update;

  if not found then
    raise exception 'registration not found' using errcode = 'P0002';
  end if;

  if v_registration.payment_status = '已完成' or v_registration.admission_status <> '待確認' then
    raise exception 'this registration can no longer be self-deleted, please contact the organizer' using errcode = '55000';
  end if;

  insert into public.admin_activity_log (session_id, registration_id, registration_seq, admin_user_id, admin_email, summary, ip_address)
  values (
    v_registration.session_id,
    null, -- the registration row itself is about to be deleted; FK would null this
          -- out anyway, set explicitly so the log entry is self-contained
    v_registration.registration_seq,
    null,
    '報名者本人（自助刪除）',
    format('報名 #%s：報名者透過修改連結自助刪除報名資料', v_registration.registration_seq),
    public.fn_client_ip()
  );

  delete from public.registrations where id = v_registration.id;
end;
$$;

grant execute on function public.fn_delete_registration_via_token(text) to anon, authenticated;
