import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getEmailAdapter } from "@/lib/email";
import { getEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate, renderHtmlTemplate } from "@/lib/email/renderTemplate";
import {
  buildReviewResultVars,
  reviewResultEmailType,
  DEFAULT_REVIEW_RESULT_SUBJECT,
  DEFAULT_REVIEW_RESULT_BODY,
  MANUAL_TRANSFER_ACCOUNT_INFO,
} from "@/lib/email/templates/reviewResult";

// Re-sends the same 審核結果 notice a single registration already got from the batch
// send-results flow — used when a reviewer extends payment_deadline (the deadline in
// the original email is now stale) or just wants to remind someone of an existing
// deadline/link. ecpay_link is recomputed fresh from NEXT_PUBLIC_SITE_URL rather than
// trusted as stored, same reasoning as the batch route.
export async function sendPaymentNoticeEmail(
  admin: SupabaseClient<Database>,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: registration } = await admin
    .from("registrations")
    .select(
      "id, session_id, contact_email, admission_status, payment_amount, payment_method, payment_deadline, ecpay_link, result_published_at"
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return { ok: false, error: "找不到報名資料" };
  }

  const { data: session } = await admin
    .from("event_sessions")
    .select("name, date_start, date_end, fee_discount_per_person")
    .eq("id", registration.session_id)
    .maybeSingle();

  const { data: members } = await admin
    .from("registration_members")
    .select("name, fee_review_result, fee_category_id")
    .eq("registration_id", registrationId)
    .order("member_order", { ascending: true });

  const { data: feeCategories } = await admin
    .from("session_fee_categories")
    .select("id, label, code")
    .eq("session_id", registration.session_id);
  const feeCategoryMap = new Map(
    (feeCategories ?? []).map((fc) => [fc.id, fc.code ? `${fc.code} ${fc.label}` : fc.label])
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let ecpayLink: string | null = registration.ecpay_link;
  if (registration.payment_amount > 0 && registration.payment_method === "online") {
    ecpayLink = `${siteUrl}/api/payments/ecpay/checkout/${registration.id}`;
    if (ecpayLink !== registration.ecpay_link) {
      await admin.from("registrations").update({ ecpay_link: ecpayLink }).eq("id", registration.id);
    }
  }

  const vars = buildReviewResultVars({
    sessionName: session?.name ?? "",
    sessionDateStart: session?.date_start ?? null,
    sessionDateEnd: session?.date_end ?? null,
    feeDiscountPerPerson: session?.fee_discount_per_person ?? 0,
    admissionStatus: registration.admission_status,
    members: (members ?? []).map((m) => ({
      name: m.name,
      feeReviewResult: m.fee_review_result,
      feeCategoryLabel: m.fee_category_id ? (feeCategoryMap.get(m.fee_category_id) ?? null) : null,
    })),
    paymentAmount: registration.payment_amount,
    paymentMethod: registration.payment_method,
    paymentDeadline: registration.payment_deadline,
    ecpayLink,
    manualTransferAccountInfo: MANUAL_TRANSFER_ACCOUNT_INFO,
  });

  const emailType = reviewResultEmailType(registration.admission_status);
  const template = await getEmailTemplate(admin, emailType, registration.session_id, {
    subjectTemplate: DEFAULT_REVIEW_RESULT_SUBJECT,
    bodyTemplate: DEFAULT_REVIEW_RESULT_BODY,
  });
  const subject = renderTemplate(template.subjectTemplate, vars);
  const body = renderHtmlTemplate(template.bodyTemplate, vars);

  const adapter = getEmailAdapter();
  const result = await adapter.sendEmail({ to: registration.contact_email, subject, body });

  await admin.from("email_logs").insert({
    registration_id: registrationId,
    type: emailType,
    status: result.status,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
    error_message: result.errorMessage ?? null,
    subject,
    body,
  });

  if (result.status !== "sent") {
    return { ok: false, error: result.errorMessage ?? "寄送失敗" };
  }

  // Same publish gate as the batch send-results route — this path is normally only
  // used to resend/remind after that batch already ran, but stamp it defensively in
  // case it's ever invoked first.
  if (!registration.result_published_at) {
    await admin
      .from("registrations")
      .update({ result_published_at: new Date().toISOString() })
      .eq("id", registrationId);
  }

  return { ok: true };
}
