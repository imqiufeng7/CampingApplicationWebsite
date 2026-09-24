-- fn_recompute_registration_payment only auto-fills payment_deadline the first time a
-- registration becomes payable (coalesce(v_current_deadline, v_default_deadline)), by
-- design, so a later manual per-registrant extension is never clobbered. But that same
-- coalesce means a vendor changing the session's own default (event_sessions.
-- payment_deadline_at) never reaches registrations that already got auto-filled under
-- the old default — they're stuck with a stale deadline, and the payment notice email
-- keeps quoting it. This adds a flag to tell "auto-filled" apart from "deliberately
-- extended by an admin", and a trigger that refreshes every still-pending, non-manual
-- registration whenever the session's default changes.

alter table public.registrations
  add column payment_deadline_is_manual boolean not null default false;

create or replace function public.fn_sync_registration_payment_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_deadline_at is distinct from old.payment_deadline_at then
    update public.registrations
    set payment_deadline = new.payment_deadline_at
    where session_id = new.id
      and payment_status = '待繳費'
      and not payment_deadline_is_manual;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_registration_payment_deadline on public.event_sessions;
create trigger trg_sync_registration_payment_deadline
after update of payment_deadline_at on public.event_sessions
for each row
execute function public.fn_sync_registration_payment_deadline();

-- One-time backfill: every currently-pending registration whose payment_deadline was
-- auto-filled under a since-changed session default (never manually extended) gets
-- synced to today's default right now, instead of waiting for the next unrelated
-- session-form save to trigger it.
update public.registrations r
set payment_deadline = es.payment_deadline_at
from public.event_sessions es
where es.id = r.session_id
  and r.payment_status = '待繳費'
  and not r.payment_deadline_is_manual
  and r.payment_deadline is distinct from es.payment_deadline_at;
