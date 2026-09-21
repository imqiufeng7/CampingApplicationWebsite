-- Set by the ECPay callback when a successful payment lands after
-- registrations.payment_deadline (e.g. someone entered the ECPay page before the
-- deadline and paid after it). The payment is still recorded as 已完成 — the money is
-- already collected — this only lets the payments page flag it for a manual decision.
alter table public.registrations add column paid_after_deadline boolean not null default false;
