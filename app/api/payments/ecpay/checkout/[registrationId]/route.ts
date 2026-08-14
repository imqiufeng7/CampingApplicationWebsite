import { createAdminClient } from "@/lib/supabase/admin";
import { buildAioCheckoutParams, buildMerchantTradeNo, getEcpayActionUrl } from "@/lib/ecpay/client";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Public link, no login (this is what the "審核結果通知" email points recipients to).
// ECPay's AIO Checkout has no pure GET-redirect API — the merchant's own page must
// auto-POST a signed form to ECPay. This route renders exactly that, computed fresh
// on each visit (not pre-generated at send-results time) so it always reflects the
// registration's current payment_amount and never goes stale.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  const { registrationId } = await params;
  const admin = createAdminClient();

  const { data: registration } = await admin
    .from("registrations")
    .select("id, payment_status, payment_amount, payment_method, session_id")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return new Response("找不到報名資料", { status: 404 });
  }

  if (registration.payment_status === "已完成") {
    return new Response("此筆報名已完成繳費，無需重複付款。", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (registration.payment_method !== "online" || registration.payment_amount <= 0) {
    return new Response("此筆報名目前不需要線上繳費。", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { data: session } = await admin
    .from("event_sessions")
    .select("name")
    .eq("id", registration.session_id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const merchantTradeNo = buildMerchantTradeNo(registration.id);

  // Persisted so the webhook (which only receives MerchantTradeNo back, not our uuid)
  // can look this registration back up — see the column comment in
  // supabase/migrations/*_init_schema.sql.
  await admin
    .from("registrations")
    .update({ ecpay_merchant_trade_no: merchantTradeNo })
    .eq("id", registration.id);

  const orderParams = buildAioCheckoutParams({
    merchantTradeNo,
    totalAmount: registration.payment_amount,
    tradeDesc: "活動報名費",
    itemName: `${session?.name ?? "活動"}報名費`,
    returnUrl: `${siteUrl}/api/payments/ecpay/callback`,
    clientBackUrl: siteUrl,
  });

  const inputs = Object.entries(orderParams)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`)
    .join("\n");

  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8" /><title>正在前往綠界付款...</title></head>
<body>
  <p>正在導向至綠界金流付款頁面，請稍候...</p>
  <form id="ecpay-form" method="post" action="${getEcpayActionUrl()}">
    ${inputs}
  </form>
  <script>document.getElementById('ecpay-form').submit();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
