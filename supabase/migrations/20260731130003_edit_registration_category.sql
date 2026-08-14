-- Surfaces registration_category_id through the edit-token RPC so the edit page can
-- look up whether the registration's category is 整組免費 and hide the fee-category
-- picker accordingly (a self-pitch registrant editing their info shouldn't suddenly
-- see an "apply for a fee waiver" field that never applied to them).
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
