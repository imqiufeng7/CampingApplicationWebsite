-- Bug: fn_check_duplicate_for_member only ever recorded ONE duplicate_matches row
-- per (registration_id_a, registration_id_b) pair — the very first matching member
-- found (whichever member's INSERT fired the trigger first) "won", and every other
-- member who also duplicates between the same two registrations was silently
-- dropped, because the insert was guarded by a plain "where not exists (... same
-- pair ...)". A 4-person family submitting twice under the same two names/phone
-- would only ever show ONE of those four names in the 疑似重複 column, not all four.
--
-- Fixed by storing an array (matched_member_names) instead of a single name, and
-- appending to the existing row's array instead of skipping when the pair already
-- has a row.
create or replace function public.fn_check_duplicate_for_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration_id uuid;
  v_name text;
  v_id_number_encrypted bytea;
  v_series_id uuid;
  v_contact_phone text;
  v_id_number text;
  v_match record;
  v_existing_id uuid;
  v_existing_names jsonb;
begin
  select rm.registration_id, rm.name, rm.id_number_encrypted
  into v_registration_id, v_name, v_id_number_encrypted
  from public.registration_members rm
  where rm.id = p_member_id;

  if v_registration_id is null then
    return;
  end if;

  select es.series_id, r.contact_phone
  into v_series_id, v_contact_phone
  from public.registrations r
  join public.event_sessions es on es.id = r.session_id
  where r.id = v_registration_id;

  if v_id_number_encrypted is not null then
    v_id_number := pgp_sym_decrypt(v_id_number_encrypted, private.id_number_key());
  end if;

  for v_match in
    select distinct r2.id as other_registration_id
    from public.registration_members rm2
    join public.registrations r2 on r2.id = rm2.registration_id
    join public.event_sessions es2 on es2.id = r2.session_id
    where es2.series_id = v_series_id
      and r2.id <> v_registration_id
      and r2.is_cancelled = false
      and rm2.name = v_name
      and (
        r2.contact_phone = v_contact_phone
        or (
          v_id_number is not null and rm2.id_number_encrypted is not null
          and pgp_sym_decrypt(rm2.id_number_encrypted, private.id_number_key()) = v_id_number
        )
      )
  loop
    perform set_config('app.bypass_column_check', 'true', true);
    update public.registrations set duplicate_flag = true
    where id in (v_registration_id, v_match.other_registration_id);
    perform set_config('app.bypass_column_check', 'false', true);

    select id, diff_summary -> 'matched_member_names'
    into v_existing_id, v_existing_names
    from public.duplicate_matches
    where (registration_id_a = v_registration_id and registration_id_b = v_match.other_registration_id)
       or (registration_id_a = v_match.other_registration_id and registration_id_b = v_registration_id)
    limit 1;

    if v_existing_id is not null then
      if v_existing_names is null then
        v_existing_names := '[]'::jsonb;
      end if;
      if not (v_existing_names ? v_name) then
        update public.duplicate_matches
        set diff_summary = jsonb_set(diff_summary, '{matched_member_names}', v_existing_names || to_jsonb(v_name))
        where id = v_existing_id;
      end if;
    else
      insert into public.duplicate_matches (registration_id_a, registration_id_b, matched_by, diff_summary)
      values (
        v_registration_id, v_match.other_registration_id, 'system',
        jsonb_build_object('matched_member_names', jsonb_build_array(v_name))
      );
    end if;
  end loop;
end;
$$;

-- Data repair: recompute the full matched-member-name set for every existing
-- duplicate_matches row from scratch, using the same name+(phone-or-id) rule as
-- the function above, instead of whatever single name happened to win before.
do $$
declare
  v_row record;
  v_phone_match boolean;
  v_names jsonb;
begin
  for v_row in select id, registration_id_a, registration_id_b from public.duplicate_matches loop
    select ra.contact_phone = rb.contact_phone into v_phone_match
    from public.registrations ra, public.registrations rb
    where ra.id = v_row.registration_id_a and rb.id = v_row.registration_id_b;

    select coalesce(jsonb_agg(distinct rma.name), '[]'::jsonb) into v_names
    from public.registration_members rma
    join public.registration_members rmb
      on rmb.registration_id = v_row.registration_id_b
     and rmb.name = rma.name
    where rma.registration_id = v_row.registration_id_a
      and (
        coalesce(v_phone_match, false)
        or (
          rma.id_number_encrypted is not null and rmb.id_number_encrypted is not null
          and pgp_sym_decrypt(rma.id_number_encrypted, private.id_number_key())
            = pgp_sym_decrypt(rmb.id_number_encrypted, private.id_number_key())
        )
      );

    update public.duplicate_matches
    set diff_summary = jsonb_build_object('matched_member_names', v_names)
    where id = v_row.id;
  end loop;
end $$;
