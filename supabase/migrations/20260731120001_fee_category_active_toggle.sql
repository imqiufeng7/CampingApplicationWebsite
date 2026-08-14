-- Lets vendor pre-build a fee category and turn it off/on later instead of deleting
-- it — so it doesn't have to be recreated from scratch (document requirements,
-- discount amount, auto_approve flag, etc.) the next time it's needed. Purely a
-- display/selectability toggle for the public form's dropdown; not a security
-- boundary, so fn_submit_registration / fn_update_registration_via_token are
-- deliberately left unchanged (a member who already picked a category that's since
-- been deactivated must still be able to save unrelated edits without their existing
-- selection being rejected).
alter table public.session_fee_categories add column is_active boolean not null default true;
