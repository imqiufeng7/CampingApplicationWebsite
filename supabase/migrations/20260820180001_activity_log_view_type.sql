-- Viewing a member's decrypted ID number logs an admin_activity_log row (PDPA audit
-- trail — see fn_get_registration_member_id_number in 20260820120001), and that's the
-- same table/feed substantive edits (審核結果, 分組, ...) log to. A reviewer opening
-- the documents dialog repeatedly while working through a session generates far more
-- "查看...身分證字號" rows than actual field changes, drowning the edit history out.
-- log_type lets the dashboard show them as two separate feeds instead of one
-- interleaved list — existing rows are all edits, hence the 'change' default.
alter table public.admin_activity_log
  add column log_type text not null default 'change' check (log_type in ('change', 'view'));

create or replace function public.fn_get_registration_member_id_number(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_registration_id uuid;
  v_registration_seq int;
  v_member_name text;
  v_encrypted bytea;
  v_admin_id uuid := auth.uid();
  v_admin_email text;
begin
  select r.session_id, r.id, r.registration_seq, rm.id_number_encrypted, rm.name
  into v_session_id, v_registration_id, v_registration_seq, v_encrypted, v_member_name
  from public.registration_members rm
  join public.registrations r on r.id = rm.registration_id
  where rm.id = p_member_id;

  if not found then
    return null;
  end if;

  if not public.has_session_access(v_session_id) then
    raise exception 'not authorized to view this member' using errcode = '42501';
  end if;

  if public.field_permission('身份證明文件') = 'hidden' then
    return null;
  end if;

  if v_encrypted is null then
    return null;
  end if;

  if v_admin_id is not null then
    select email into v_admin_email from public.admin_users where id = v_admin_id;
  end if;

  insert into public.admin_activity_log
    (session_id, registration_id, registration_seq, admin_user_id, admin_email, summary, ip_address, log_type)
  values (
    v_session_id,
    v_registration_id,
    v_registration_seq,
    v_admin_id,
    coalesce(v_admin_email, '未知使用者'),
    format('報名 #%s：查看成員「%s」身分證字號', v_registration_seq, v_member_name),
    public.fn_client_ip(),
    'view'
  );

  return pgp_sym_decrypt(v_encrypted, private.id_number_key());
end;
$$;
