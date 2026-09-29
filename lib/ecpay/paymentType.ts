// ECPay reports how an order was actually paid as "<Method>_<Channel>" (e.g.
// Credit_CreditCard, ATM_TAISHIN, CVS_FAMILY, BARCODE_BARCODE). Only the method prefix
// matters to staff reconciling payments.
const METHOD_LABELS: Record<string, string> = {
  Credit: "信用卡",
  ATM: "ATM 虛擬帳號",
  WebATM: "網路 ATM",
  CVS: "超商代碼",
  BARCODE: "超商條碼",
  ApplePay: "Apple Pay",
  TWQR: "台灣 Pay",
  BNPL: "無卡分期",
};

export function ecpayPaymentTypeLabel(paymentType: string | null | undefined): string | null {
  if (!paymentType) return null;
  const method = paymentType.split("_")[0];
  return METHOD_LABELS[method] ?? paymentType;
}

// What the admin UI shows in a "繳費方式" cell: the real ECPay method once a payment
// has settled, otherwise the registration's configured channel.
export function paymentMethodDisplay(
  paymentMethod: string | null,
  ecpayPaymentType: string | null | undefined
): string {
  const actual = ecpayPaymentTypeLabel(ecpayPaymentType);
  if (actual) return `${actual}（綠界）`;
  if (paymentMethod === "online") return "綠界線上付款";
  if (paymentMethod === "manual") return "人工轉帳";
  return "-";
}
