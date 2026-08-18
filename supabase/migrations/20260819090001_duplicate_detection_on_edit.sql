-- The duplicate-check trigger only fired on INSERT, so a duplicate created by editing
-- an existing registration via its edit link (fn_update_registration_via_token updates
-- registration_members in place, it doesn't re-insert) was never caught — this is very
-- likely what a manual test via the edit flow would have hit. Extending the trigger to
-- also fire when name or id_number_encrypted changes on an existing row closes that gap.
drop trigger if exists trg_check_duplicate_registration on public.registration_members;
create trigger trg_check_duplicate_registration
  after insert or update of name, id_number_encrypted on public.registration_members
  for each row
  execute function public.fn_check_duplicate_registration();
