import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCheckMacValue } from "@/lib/ecpay/client";
import { isPaidAfterDeadline } from "@/lib/ecpay/paidLate";

// Server-to-server webhook from ECPay — no admin session, no CSRF token, nothing but
// the CheckMacValue to prove authenticity. Runs entirely on the service-role client
// by necessity (there's no logged-in user to act as).
export async function POST(request: Request) {
  const form = await request.formData();
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    payload[key] = String(value);
  }

  if (!verifyCheckMacValue(payload)) {
    return new Response("0|CheckMacValueError", { status: 400 });
  }

  const admin = createAdminClient();

  // Every MerchantTradeNo the checkout route ever issued lives in ecpay_orders — an
  // ATM/超商 payer may settle an older number after the link was reopened and a newer
  // one minted. registrations.ecpay_merchant_trade_no (latest only) stays as a
  // fallback for orders created before ecpay_orders existed.
  const { data: order } = await admin
    .from("ecpay_orders")
    .select("registration_id")
    .eq("merchant_trade_no", payload.MerchantTradeNo)
    .maybeSingle();

  const registrationQuery = admin
    .from("registrations")
    .select("id, payment_status, payment_deadline, ecpay_trade_no, ecpay_payment_type");
  const { data: registration } = order
    ? await registrationQuery.eq("id", order.registration_id).maybeSingle()
    : await registrationQuery.eq("ecpay_merchant_trade_no", payload.MerchantTradeNo).maybeSingle();

  if (!registration) {
    console.error("[ecpay callback] no registration for MerchantTradeNo", payload.MerchantTradeNo);
    return new Response("0|RegistrationNotFound", { status: 400 });
  }

  await admin
    .from("ecpay_orders")
    .upsert({
      merchant_trade_no: payload.MerchantTradeNo,
      registration_id: registration.id,
      amount: Number(payload.TradeAmt) || 0,
      rtn_code: payload.RtnCode ?? null,
      payment_type: payload.PaymentType ?? null,
      trade_no: payload.TradeNo ?? null,
      paid_at: payload.PaymentDate ?? null,
      notified_at: new Date().toISOString(),
    });

  if (payload.RtnCode === "1") {
    if (registration.payment_status !== "已完成") {
      await admin
        .from("registrations")
        .update({
          payment_status: "已完成",
          ecpay_trade_no: payload.TradeNo,
          ecpay_merchant_trade_no: payload.MerchantTradeNo,
          ecpay_payment_type: payload.PaymentType ?? null,
          paid_after_deadline: isPaidAfterDeadline(registration.payment_deadline, payload.PaymentDate),
        })
        .eq("id", registration.id);
    } else if (registration.ecpay_trade_no === payload.TradeNo && !registration.ecpay_payment_type) {
      // ECPay retrying the notification for the payment we already recorded.
      await admin
        .from("registrations")
        .update({ ecpay_payment_type: payload.PaymentType ?? null })
        .eq("id", registration.id);
    } else if (registration.ecpay_trade_no !== payload.TradeNo) {
      // A second, separate successful payment for an already-settled registration
      // (e.g. paid an old 超商 code and then by card). Kept in ecpay_orders above;
      // surfaced here so it can be found in the logs for a refund.
      console.warn(
        "[ecpay callback] extra payment for already-paid registration",
        registration.id,
        payload.MerchantTradeNo,
        payload.TradeNo
      );
    }
  }

  // ECPay requires exactly this response body to acknowledge receipt — anything else
  // (including a non-2xx status) causes it to retry the notification.
  return new Response("1|OK", { status: 200 });
}
