import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getEmailAdapter } from "@/lib/email";
import { getEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate } from "@/lib/email/renderTemplate";
import {
  buildResubmissionRequestVars,
  DEFAULT_RESUBMISSION_REQUEST_SUBJECT,
  DEFAULT_RESUBMISSION_REQUEST_BODY,
} from "@/lib/email/templates/resubmissionRequest";
import { formatRegistrationNo } from "@/lib/registrationNo";

// Shared by the admin-facing send-resubmission-request route (ReviewTable's inline
// cell) and updateRegistrationReview (the detail-page form) — both need the same
// "mark 退回補件, notify the registrant with their existing edit link" behavior.
// Takes a service-role client since it needs to read across the full registration
// (not just what the caller's own field permissions expose) and write email_logs,
// same reason send-confirmation/send-results use createAdminClient().
export async function sendResubmissionRequestEmail(
  admin: SupabaseClient<Database>,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: registration } = await admin
    .from("registrations")
    .select("id, session_id, contact_email, registration_seq, edit_token, resubmission_reason")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return { ok: false, error: "找不到報名資料" };
  }
  if (!registration.resubmission_reason) {
    return { ok: false, error: "請先填寫需補件原因，才能寄送通知" };
  }

  const { data: session } = await admin
    .from("event_sessions")
    .select("name")
    .eq("id", registration.session_id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const vars = buildResubmissionRequestVars({
    sessionName: session?.name ?? "",
    registrationNo: formatRegistrationNo(registration.registration_seq),
    reason: registration.resubmission_reason,
    editUrl: `${siteUrl}/edit/${registration.edit_token}`,
  });

  const template = await getEmailTemplate(admin, "退回補件", registration.session_id, {
    subjectTemplate: DEFAULT_RESUBMISSION_REQUEST_SUBJECT,
    bodyTemplate: DEFAULT_RESUBMISSION_REQUEST_BODY,
  });
  const subject = renderTemplate(template.subjectTemplate, vars);
  const body = renderTemplate(template.bodyTemplate, vars);

  const adapter = getEmailAdapter();
  const result = await adapter.sendEmail({ to: registration.contact_email, subject, body });

  await admin.from("email_logs").insert({
    registration_id: registrationId,
    type: "退回補件",
    status: result.status,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
    error_message: result.errorMessage ?? null,
    subject,
    body,
  });

  if (result.status !== "sent") {
    return { ok: false, error: result.errorMessage ?? "寄送失敗" };
  }
  return { ok: true };
}
