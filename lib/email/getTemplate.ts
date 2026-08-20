import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { EmailType } from "@/lib/db/types";

export interface EmailTemplateText {
  subjectTemplate: string;
  bodyTemplate: string;
}

// Resolution order: per-session override (if the vendor made one) → global default
// row → the hardcoded fallback baked into each template file (only reachable if the
// global row was somehow deleted — the seed migration always creates it).
export async function getEmailTemplate(
  admin: SupabaseClient<Database>,
  type: EmailType,
  sessionId: string,
  fallback: EmailTemplateText
): Promise<EmailTemplateText> {
  const { data: override } = await admin
    .from("session_email_templates")
    .select("subject_template, body_template")
    .eq("session_id", sessionId)
    .eq("type", type)
    .maybeSingle();
  if (override) {
    return { subjectTemplate: override.subject_template, bodyTemplate: override.body_template };
  }

  const { data: global } = await admin
    .from("email_templates")
    .select("subject_template, body_template")
    .eq("type", type)
    .maybeSingle();
  if (global) {
    return { subjectTemplate: global.subject_template, bodyTemplate: global.body_template };
  }

  return fallback;
}

// For email types with no session context at all (e.g. 管理員邀請 — inviting someone
// to the admin team isn't tied to any event_sessions row), so there's no per-session
// override tier to check, unlike getEmailTemplate above.
export async function getGlobalEmailTemplate(
  admin: SupabaseClient<Database>,
  type: EmailType,
  fallback: EmailTemplateText
): Promise<EmailTemplateText> {
  const { data: global } = await admin
    .from("email_templates")
    .select("subject_template, body_template")
    .eq("type", type)
    .maybeSingle();
  if (global) {
    return { subjectTemplate: global.subject_template, bodyTemplate: global.body_template };
  }
  return fallback;
}
