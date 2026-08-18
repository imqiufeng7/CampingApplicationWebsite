"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireFieldEditable, requireRole, requireSessionAccess } from "@/lib/auth/guards";
import { sendResubmissionRequestEmail } from "@/lib/email/sendResubmissionRequest";

export type ActionState = { error: string | null };

function formToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function str(v: FormDataEntryValue | undefined | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
}

function num(v: FormDataEntryValue | undefined | null): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Review / admission / grouping / cancellation — host_org (and vendor)
// ---------------------------------------------------------------------------
export async function updateRegistrationReview(
  sessionId: string,
  registrationId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, "錄取分組結果");
  await requireFieldEditable(admin, "取消退費資訊");
  await requireFieldEditable(admin, "備註");
  await requireSessionAccess(sessionId);

  const raw = formToObject(formData);
  const isCancelled = raw.is_cancelled === "on" || raw.is_cancelled === "true";

  // review_status is not writable here — it's computed from each member's
  // fee_review_result/needs_resubmission (see fn_recompute_registration_review_status),
  // set from the document dialog's per-member controls instead of this bulk form.
  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({
      admission_status: raw.admission_status as never,
      waitlist_rank: num(raw.waitlist_rank),
      group_zone: str(raw.group_zone),
      group_number: str(raw.group_number),
      tent_type: str(raw.tent_type),
      sleeping_bag_own_qty: num(raw.sleeping_bag_own_qty) ?? 0,
      sleeping_bag_rent_qty: num(raw.sleeping_bag_rent_qty) ?? 0,
      is_cancelled: isCancelled,
      cancelled_at: isCancelled ? new Date().toISOString() : null,
      cancel_reason: isCancelled ? str(raw.cancel_reason) : null,
      refund_amount: num(raw.refund_amount),
      refund_status: str(raw.refund_status) as never,
      admin_note: str(raw.admin_note),
    })
    .eq("id", registrationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/registrations/${sessionId}/${registrationId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Payment — finance (and vendor)
// ---------------------------------------------------------------------------
export async function updateRegistrationPayment(
  sessionId: string,
  registrationId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, "繳費狀態");
  await requireSessionAccess(sessionId);

  const raw = formToObject(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({
      payment_status: raw.payment_status as never,
      payment_amount: num(raw.payment_amount) ?? 0,
      payment_method: (str(raw.payment_method) as never) ?? null,
      manual_transfer_last5: str(raw.manual_transfer_last5),
      manual_transfer_note: str(raw.manual_transfer_note),
    })
    .eq("id", registrationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/registrations/${sessionId}/${registrationId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Per-member fee review — host_org (and vendor)
// ---------------------------------------------------------------------------
export async function updateMemberFeeReview(
  sessionId: string,
  registrationId: string,
  memberId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, "免付費審核結果");
  await requireSessionAccess(sessionId);

  const feeReviewResult = str(formData.get("fee_review_result"));
  if (!feeReviewResult) {
    return { error: "請選擇審核結果" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("registration_members")
    .update({ fee_review_result: feeReviewResult as never })
    .eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/registrations/${sessionId}/${registrationId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Per-member 退回補件 — host_org (and vendor). Marking/clearing lives in the document
// dialog (each member's documents are reviewed independently); sending the notice is
// a separate explicit step so a reviewer can flag several members before one email
// goes out covering all of them.
// ---------------------------------------------------------------------------
export async function updateMemberResubmission(
  sessionId: string,
  registrationId: string,
  memberId: string,
  needsResubmission: boolean,
  note: string
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, "免付費審核結果");
  await requireSessionAccess(sessionId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("registration_members")
    .update({
      needs_resubmission: needsResubmission,
      resubmission_note: needsResubmission ? (note.trim() || null) : null,
    })
    .eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/registrations/${sessionId}/${registrationId}`);
  revalidatePath(`/admin/reviews/${sessionId}`);
  return { error: null };
}

export async function sendResubmissionNotice(
  sessionId: string,
  registrationId: string
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, "免付費審核結果");
  await requireSessionAccess(sessionId);

  const adminClient = createAdminClient();
  const result = await sendResubmissionRequestEmail(adminClient, registrationId);
  if (!result.ok) {
    return { error: result.error ?? "寄送失敗" };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Delete — vendor only. This is a permanent hard delete (registration_members and
// registration_files cascade via their FKs), unlike is_cancelled which is a
// reversible flag any host_org with 取消退費資訊 access can set. Deliberately not
// exposed to other roles since there's no undo.
// ---------------------------------------------------------------------------
export async function deleteRegistration(sessionId: string, registrationId: string): Promise<ActionState> {
  await requireRole("vendor");
  await requireSessionAccess(sessionId);

  const supabase = await createClient();
  const { error } = await supabase.from("registrations").delete().eq("id", registrationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/reviews/${sessionId}`);
  revalidatePath(`/admin/payments/${sessionId}`);
  return { error: null };
}
