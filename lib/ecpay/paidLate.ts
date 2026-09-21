// ECPay's PaymentDate is Taipei wall-clock "yyyy/MM/dd HH:mm:ss" with no offset.
function parseEcpayPaymentDate(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Falls back to "now" if PaymentDate is missing/unparseable — the callback normally
// arrives right after payment, so that's a close enough stand-in.
export function isPaidAfterDeadline(
  paymentDeadline: string | null,
  ecpayPaymentDate: string | undefined,
  now: Date = new Date()
): boolean {
  if (!paymentDeadline) return false;
  const paidAt = parseEcpayPaymentDate(ecpayPaymentDate) ?? now;
  return paidAt.getTime() > new Date(paymentDeadline).getTime();
}
