import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getEmailAdapter } from "@/lib/email";
import { getEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate, renderHtmlTemplate } from "@/lib/email/renderTemplate";
import {
  buildResubmissionRequestVars,
  DEFAULT_RESUBMISSION_REQUEST_SUBJECT,
  DEFAULT_RESUBMISSION_REQUEST_BODY,
} from "@/lib/email/templates/resubmissionRequest";
import { formatRegistrationNo } from "@/lib/registrationNo";

// Composes the notice from whichever members are currently flagged
// needs_resubmission=true (each with their own reviewer-written note) — different
// people in the same registration can have different document problems, so this is
// no longer a single registration-level reason. Called by the sendResubmissionNotice
// server action, which the document dialog's "寄送補件通知" button invokes directly.
export async function sendResubmissionRequestEmail(
  admin: SupabaseClient<Database>,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: registration } = await admin
    .from("registrations")
    .select("id, session_id, contact_email, registration_seq, edit_token")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return { ok: false, error: "找不到報名資料" };
  }

  const { data: flaggedMembers } = await admin
    .from("registration_members")
    .select("name, resubmission_note")
    .eq("registration_id", registrationId)
    .eq("needs_resubmission", true)
    .order("member_order", { ascending: true });

  const memberIssues = (flaggedMembers ?? [])
    .filter((m) => m.resubmission_note)
    .map((m) => ({ name: m.name, note: m.resubmission_note as string }));

  if (memberIssues.length === 0) {
    return { ok: false, error: "目前沒有成員被標記需補件，或尚未填寫補件原因" };
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
    memberIssues,
    editUrl: `${siteUrl}/edit/${registration.edit_token}`,
  });

  const template = await getEmailTemplate(admin, "退回補件", registration.session_id, {
    subjectTemplate: DEFAULT_RESUBMISSION_REQUEST_SUBJECT,
    bodyTemplate: DEFAULT_RESUBMISSION_REQUEST_BODY,
  });
  const subject = renderTemplate(template.subjectTemplate, vars);
  const body = renderHtmlTemplate(template.bodyTemplate, vars);

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
