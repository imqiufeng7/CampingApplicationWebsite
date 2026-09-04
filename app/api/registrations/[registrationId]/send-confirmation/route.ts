import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailAdapter } from "@/lib/email";
import { getEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate, renderHtmlTemplate } from "@/lib/email/renderTemplate";
import {
  buildRegistrationConfirmationVars,
  DEFAULT_REGISTRATION_CONFIRMATION_SUBJECT,
  DEFAULT_REGISTRATION_CONFIRMATION_BODY,
} from "@/lib/email/templates/registrationConfirmation";

const MAX_SENDS_PER_REGISTRATION = 5;

// Public, unauthenticated (called right after the registrant's own successful
// submission, and by the "resend" button on the success page) — destination is
// always the registration's own stored contact_email, never client-supplied, so this
// can't be used to spam arbitrary addresses. Capped per-registration as a basic abuse
// guard against someone hammering the resend button.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  const { registrationId } = await params;
  const admin = createAdminClient();

  const { data: registration } = await admin
    .from("registrations")
    .select("id, session_id, contact_email, contact_phone, registration_seq")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });
  }

  const { count } = await admin
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("registration_id", registrationId)
    .eq("type", "報名確認");

  if ((count ?? 0) >= MAX_SENDS_PER_REGISTRATION) {
    return NextResponse.json({ error: "已達寄送次數上限，請洽詢主辦單位" }, { status: 429 });
  }

  const [{ data: session }, { data: members }] = await Promise.all([
    admin.from("event_sessions").select("name").eq("id", registration.session_id).maybeSingle(),
    admin
      .from("registration_members")
      .select("name")
      .eq("registration_id", registrationId)
      .order("member_order", { ascending: true }),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const registrationNo = `R${String(registration.registration_seq).padStart(6, "0")}`;

  const vars = buildRegistrationConfirmationVars({
    sessionName: session?.name ?? "",
    registrationNo,
    contactEmail: registration.contact_email,
    contactPhone: registration.contact_phone,
    members: (members ?? []).map((m) => ({ name: m.name })),
    lookupUrl: `${siteUrl}/lookup?email=${encodeURIComponent(registration.contact_email)}&phone=${encodeURIComponent(registration.contact_phone)}`,
  });

  const template = await getEmailTemplate(admin, "報名確認", registration.session_id, {
    subjectTemplate: DEFAULT_REGISTRATION_CONFIRMATION_SUBJECT,
    bodyTemplate: DEFAULT_REGISTRATION_CONFIRMATION_BODY,
  });
  const subject = renderTemplate(template.subjectTemplate, vars);
  const body = renderHtmlTemplate(template.bodyTemplate, vars);

  const adapter = getEmailAdapter();
  const result = await adapter.sendEmail({ to: registration.contact_email, subject, body });

  await admin.from("email_logs").insert({
    registration_id: registrationId,
    type: "報名確認",
    status: result.status,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
    error_message: result.errorMessage ?? null,
    subject,
    body,
  });

  if (result.status !== "sent") {
    return NextResponse.json({ error: result.errorMessage ?? "寄送失敗" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
