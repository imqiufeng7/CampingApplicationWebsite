import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { getEmailAdapter } from "@/lib/email";
import { getEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate, renderHtmlTemplate } from "@/lib/email/renderTemplate";
import {
  buildEditLinkGrantedVars,
  DEFAULT_EDIT_LINK_GRANTED_SUBJECT,
  DEFAULT_EDIT_LINK_GRANTED_BODY,
} from "@/lib/email/templates/editLinkGranted";
import { formatRegistrationNo } from "@/lib/registrationNo";

// General-purpose counterpart to sendResubmissionRequestEmail — that one only ever
// fires from the 退回補件 workflow (requires flagged members with a note); this is for
// any other reason staff need to reopen editing once (e.g. a phone call asking to
// swap a member close to the event). Both grant exactly one save the same way.
export async function sendEditLinkGrantedEmail(
  admin: SupabaseClient<Database>,
  registrationId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: registration } = await admin
    .from("registrations")
    .select("id, session_id, contact_email, registration_seq, edit_token")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return { ok: false, error: "找不到報名資料" };
  }

  const { data: session } = await admin
    .from("event_sessions")
    .select("name")
    .eq("id", registration.session_id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const vars = buildEditLinkGrantedVars({
    sessionName: session?.name ?? "",
    registrationNo: formatRegistrationNo(registration.registration_seq),
    reason,
    editUrl: `${siteUrl}/edit/${registration.edit_token}`,
  });

  const template = await getEmailTemplate(admin, "開放修改", registration.session_id, {
    subjectTemplate: DEFAULT_EDIT_LINK_GRANTED_SUBJECT,
    bodyTemplate: DEFAULT_EDIT_LINK_GRANTED_BODY,
  });
  const subject = renderTemplate(template.subjectTemplate, vars);
  const body = renderHtmlTemplate(template.bodyTemplate, vars);

  const adapter = getEmailAdapter();
  const result = await adapter.sendEmail({ to: registration.contact_email, subject, body });

  await admin.from("email_logs").insert({
    registration_id: registrationId,
    type: "開放修改",
    status: result.status,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
    error_message: result.errorMessage ?? null,
    subject,
    body,
  });

  if (result.status !== "sent") {
    return { ok: false, error: result.errorMessage ?? "寄送失敗" };
  }

  await admin.from("registrations").update({ remaining_self_edits: 1 }).eq("id", registrationId);

  return { ok: true };
}
