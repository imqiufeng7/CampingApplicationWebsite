"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireFieldEditable, requireSessionAccess } from "@/lib/auth/guards";
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({
      review_status: raw.review_status as never,
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
      resubmission_reason: str(raw.resubmission_reason),
      admin_note: str(raw.admin_note),
    })
    .eq("id", registrationId);

  if (error) {
    return { error: error.message };
  }

  // Saving with 退回補件 selected always (re)sends the notice — lets a reviewer
  // correct the reason text and resend, matching the review-table cell's behavior.
  if (raw.review_status === "退回補件") {
    const adminClient = createAdminClient();
    const sendResult = await sendResubmissionRequestEmail(adminClient, registrationId);
    if (!sendResult.ok) {
      revalidatePath(`/admin/registrations/${sessionId}/${registrationId}`);
      return { error: `已儲存，但補件通知寄送失敗：${sendResult.error}` };
    }
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
