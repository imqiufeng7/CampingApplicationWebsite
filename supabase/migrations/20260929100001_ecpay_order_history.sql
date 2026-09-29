-- The checkout route mints a fresh MerchantTradeNo on every visit and overwrote
-- registrations.ecpay_merchant_trade_no with it. Credit card pays on the spot so that
-- never mattered, but ATM 虛擬帳號 / 超商代碼 / 超商條碼 are "取號 now, pay later" — if
-- the payer opened the link again after taking a number (a reload, re-checking the
-- code, an email scanner prefetching the link), the stored trade no moved on, and
-- ECPay's paid notification for the original number found no registration and was
-- dropped. Keep every trade no ever issued so any of them maps back.
create table public.ecpay_orders (
  merchant_trade_no text primary key,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  -- Filled in from ECPay's ReturnURL notification for this specific order.
  rtn_code text,
  payment_type text,
  trade_no text,
  paid_at text,
  notified_at timestamptz
);

create index ecpay_orders_registration_id_idx on public.ecpay_orders (registration_id);

-- Written only by the checkout route and the ECPay webhook, both on the service-role
-- client — no policies for authenticated/anon on purpose.
alter table public.ecpay_orders enable row level security;

-- Seed with the one trade no per registration we still know about.
insert into public.ecpay_orders (merchant_trade_no, registration_id, amount, created_at)
select ecpay_merchant_trade_no, id, payment_amount, updated_at
from public.registrations
where ecpay_merchant_trade_no is not null
on conflict do nothing;

-- ECPay's own PaymentType for the payment that settled the registration
-- (e.g. Credit_CreditCard, ATM_TAISHIN, CVS_CVS, BARCODE_BARCODE), so the admin UI can
-- say how someone actually paid instead of a blanket "線上刷卡/ATM".
alter table public.registrations add column ecpay_payment_type text;
