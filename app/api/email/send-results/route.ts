import { NextResponse } from "next/server";
import { requireAdmin, requireFieldEditable, requireSessionAccess, ForbiddenError } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  // Optional: restrict the batch to specific registrations (targeted resend — e.g. a
  // 備取→正取 promotion, or someone who reports never getting the first email) instead
  // of every eligible registration in the session. The eligibility filters below
  // still apply on top of this, so an accidentally-selected 待確認/取消 row is silently
  // skipped rather than emailed.
  const registrationIds = Array.isArray(body?.registrationIds)
    ? (body.registrationIds as unknown[]).filter((id): id is string => typeof id === "string")
    : null;

  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  try {
    const currentAdmin = await requireAdmin();
    await requireFieldEditable(currentAdmin, "錄取分組結果");
    await requireSessionAccess(sessionId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  // email_logs writes (and the ecpay_link backfill below) have no RLS policy for the
  // authenticated role by design — only service-role can write them. The permission
  // check above already confirmed the caller is authorized to trigger this batch.
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { data: session } = await admin
    .from("event_sessions")
    .select("name, date_start, date_end, fee_discount_per_person")
    .eq("id", sessionId)
    .maybeSingle();

  let registrationsQuery = admin
    .from("registrations")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_cancelled", false)
    .eq("review_status", "審核通過")
    .in("admission_status", ["正取", "備取"]);
  if (registrationIds) {
    registrationsQuery = registrationsQuery.in("id", registrationIds);
  }
  const { data: registrations } = await registrationsQuery;

  const { data: feeCategories } = await admin
    .from("session_fee_categories")
    .select("id, label, code")
    .eq("session_id", sessionId);
  const feeCategoryMap = new Map(
    (feeCategories ?? []).map((fc) => [fc.id, fc.code ? `${fc.code} ${fc.label}` : fc.label])
  );

  // 正取/備取 each have their own independently-editable template — fetch both once
  // up front rather than per-registration inside the loop.
  const [admittedTemplate, waitlistedTemplate] = await Promise.all([
    getEmailTemplate(admin, "審核結果-正取", sessionId, {
      subjectTemplate: DEFAULT_REVIEW_RESULT_SUBJECT,
      bodyTemplate: DEFAULT_REVIEW_RESULT_BODY,
    }),
    getEmailTemplate(admin, "審核結果-備取", sessionId, {
      subjectTemplate: DEFAULT_REVIEW_RESULT_SUBJECT,
      bodyTemplate: DEFAULT_REVIEW_RESULT_BODY,
    }),
  ]);

  const adapter = getEmailAdapter();
  let sent = 0;
  let failed = 0;

  for (const registration of registrations ?? []) {
    const { data: members } = await admin
      .from("registration_members")
      .select("name, fee_review_result, fee_category_id")
      .eq("registration_id", registration.id)
      .order("member_order", { ascending: true });

    // Always recomputed from the current NEXT_PUBLIC_SITE_URL rather than trusting
    // whatever's stored — a stored value only reflects whichever environment last
    // wrote it (e.g. a stale localhost URL left over from local testing against this
    // same database), and would otherwise go out in emails forever once cached.
    let ecpayLink: string | null = null;
    if (registration.payment_amount > 0 && registration.payment_method === "online") {
      ecpayLink = `${siteUrl}/api/payments/ecpay/checkout/${registration.id}`;
      await admin.from("registrations").update({ ecpay_link: ecpayLink }).eq("id", registration.id);
    }

    const vars = buildReviewResultVars({
      sessionName: session?.name ?? "",
      sessionDateStart: session?.date_start ?? null,
      sessionDateEnd: session?.date_end ?? null,
      feeDiscountPerPerson: session?.fee_discount_per_person ?? 0,
      admissionStatus: registration.admission_status,
      waitlistRank: registration.waitlist_rank,
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
    const template = registration.admission_status === "備取" ? waitlistedTemplate : admittedTemplate;
    const subject = renderTemplate(template.subjectTemplate, vars);
    const emailBody = renderHtmlTemplate(template.bodyTemplate, vars);

    const result = await adapter.sendEmail({
      to: registration.contact_email,
      subject,
      body: emailBody,
    });

    await admin.from("email_logs").insert({
      registration_id: registration.id,
      type: emailType,
      status: result.status,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
      error_message: result.errorMessage ?? null,
      subject,
      body: emailBody,
    });

    if (result.status === "sent") {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ total: (registrations ?? []).length, sent, failed });
}
