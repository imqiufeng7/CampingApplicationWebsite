"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import type { EmailType } from "@/lib/db/types";

export type ActionState = { error: string | null };

export async function updateEmailTemplate(
  type: EmailType,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const subject = formData.get("subject_template");
  const body = formData.get("body_template");
  if (typeof subject !== "string" || !subject.trim() || typeof body !== "string" || !body.trim()) {
    return { error: "主旨與內文皆為必填" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({ subject_template: subject, body_template: body, updated_at: new Date().toISOString() })
    .eq("type", type);

  if (error) return { error: error.message };
  revalidatePath("/admin/email-templates");
  return { error: null };
}
