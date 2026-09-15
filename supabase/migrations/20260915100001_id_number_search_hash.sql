-- Lets the review list search box match a member by full 身分證字號 without ever
-- decrypting/exposing anyone's ID number in bulk to do it. registration_members
-- already stores id_number_hash (an HMAC-SHA256 of the plaintext, computed at
-- submission — see fn_submit_registration) purely for exact-match lookups like
-- this; a hash reveals nothing about the original value, so it's safe to include
-- in the review list's normal data load. This function hashes whatever the admin
-- typed into the search box, using the exact same key/algorithm, so the client can
-- compare it against the already-loaded id_number_hash column locally — no
-- decryption, and (unlike fn_get_registration_member_id_number) no per-view audit
-- log entry, since nothing is actually being revealed here.
create or replace function public.fn_hash_id_number_for_search(p_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(hmac(p_value, private.id_number_key(), 'sha256'), 'hex');
$$;

grant execute on function public.fn_hash_id_number_for_search(text) to authenticated;
