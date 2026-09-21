const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const ATM_MAX_DAYS = 60;
const CVS_MAX_MINUTES = 43200;

// Translates our payment_deadline into ECPay's per-channel expiry parameters so the
// virtual ATM account / convenience-store code ECPay hands out stops accepting money at
// (or just before — never after) our own deadline: ExpireDate is whole days (ATM),
// StoreExpireDate is minutes for CVS but days for BARCODE, hence the separate values.
// Days are rounded down so a code can never outlive the deadline; the 1-day floor is
// ECPay's own minimum, so a deadline under a day away still yields a 1-day ATM account.
// Credit card has no equivalent parameter — see the checkout route.
export function computeEcpayExpiry(deadline: Date, now: Date = new Date()) {
  const remainingMs = Math.max(0, deadline.getTime() - now.getTime());
  const days = Math.min(ATM_MAX_DAYS, Math.max(1, Math.floor(remainingMs / DAY_MS)));
  const minutes = Math.min(CVS_MAX_MINUTES, Math.max(1, Math.floor(remainingMs / MINUTE_MS)));
  return { ExpireDate: days, StoreExpireDate: minutes };
}
