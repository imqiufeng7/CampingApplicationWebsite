-- The earlier duplicate-detection triggers only fire on INSERT/UPDATE, so they never
-- touched registrations that existed *before* those migrations and haven't been
-- edited since — which is exactly the test data the vendor pointed at (two
-- registrations from 2026-07-30, both containing a member named 劉靖瑩, neither
-- ever re-saved after the trigger was added). This extracts the trigger's matching
-- logic into a plain function callable both from the trigger and a one-time backfill
-- loop over every existing member, so already-duplicate data gets flagged too.
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

    insert into public.duplicate_matches (registration_id_a, registration_id_b, matched_by, diff_summary)
    select v_registration_id, v_match.other_registration_id, 'system',
      jsonb_build_object('matched_member_name', v_name)
    where not exists (
      select 1 from public.duplicate_matches
      where (registration_id_a = v_registration_id and registration_id_b = v_match.other_registration_id)
         or (registration_id_a = v_match.other_registration_id and registration_id_b = v_registration_id)
    );
  end loop;
end;
$$;

create or replace function public.fn_check_duplicate_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_check_duplicate_for_member(new.id);
  return new;
end;
$$;

-- One-time backfill: run the same check for every member that already exists, so
-- pre-existing duplicates (like the vendor's test data) get flagged immediately
-- rather than only the next time something touches that row.
do $$
declare
  v_member record;
begin
  for v_member in select id from public.registration_members loop
    perform public.fn_check_duplicate_for_member(v_member.id);
  end loop;
end $$;
