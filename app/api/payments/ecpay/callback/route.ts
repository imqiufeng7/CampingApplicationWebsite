import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCheckMacValue } from "@/lib/ecpay/client";

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
  const { data: registration } = await admin
    .from("registrations")
    .select("id, payment_status")
    .eq("ecpay_merchant_trade_no", payload.MerchantTradeNo)
    .maybeSingle();

  if (!registration) {
    return new Response("0|RegistrationNotFound", { status: 400 });
  }

  if (payload.RtnCode === "1" && registration.payment_status !== "已完成") {
    await admin
      .from("registrations")
      .update({
        payment_status: "已完成",
        ecpay_trade_no: payload.TradeNo,
      })
      .eq("id", registration.id);
  }

  // ECPay requires exactly this response body to acknowledge receipt — anything else
  // (including a non-2xx status) causes it to retry the notification.
  return new Response("1|OK", { status: 200 });
}
