"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireFieldEditable, requireSessionAccess } from "@/lib/auth/guards";
import type { FieldGroup } from "@/lib/auth/permissions";

export type ActionState = { error: string | null };

// Matches the column -> field_group mapping in
// enforce_registrations_column_permissions() (supabase/migrations/20260731090002_dynamic_column_permissions.sql)
// — that trigger is the real security boundary, this map just lets the action ask
// public.field_permission() the same question the DB will ask, so a cell edit fails
// with a friendly message instead of a raw DB error when the group isn't editable.
// sleeping_bag_own_qty/rent_qty deliberately excluded — they're system-derived from
// each member's fee category selection now (see fn_recompute_sleeping_bag_counts,
// supabase/migrations/20260731110001_auto_approve_fee_categories.sql), not a value any
// role enters directly.
export type RegistrationEditableField =
  | "review_status"
  | "admission_status"
  | "waitlist_rank"
  | "group_zone"
  | "group_number"
  | "is_cancelled"
  | "cancel_reason"
  | "admin_note";

const FIELD_GROUP_BY_COLUMN: Record<RegistrationEditableField, FieldGroup> = {
  review_status: "錄取分組結果",
  admission_status: "錄取分組結果",
  waitlist_rank: "錄取分組結果",
  group_zone: "錄取分組結果",
  group_number: "錄取分組結果",
  is_cancelled: "取消退費資訊",
  cancel_reason: "取消退費資訊",
  admin_note: "備註",
};

// Single-column PATCH for the inline-editable review table. One column per call (not a
// full-form overwrite like updateRegistrationReview) so a cell edit can never clobber a
// sibling field's concurrent edit.
export async function updateRegistrationField(
  sessionId: string,
  registrationId: string,
  field: RegistrationEditableField,
  value: string | number | boolean | null
): Promise<ActionState> {
  const admin = await requireAdmin();
  await requireFieldEditable(admin, FIELD_GROUP_BY_COLUMN[field]);
  await requireSessionAccess(sessionId);

  const supabase = await createClient();

  const patch: Record<string, unknown> = { [field]: value };
  if (field === "is_cancelled") {
    patch.cancelled_at = value ? new Date().toISOString() : null;
    if (!value) patch.cancel_reason = null;
  }

  const { error } = await supabase
    .from("registrations")
    .update(patch as never)
    .eq("id", registrationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/reviews/${sessionId}`);
  return { error: null };
}

export async function getMemberIdNumbersForRegistration(
  sessionId: string,
  registrationId: string,
  memberIds: string[]
): Promise<{ memberId: string; idNumber: string | null }[]> {
  await requireSessionAccess(sessionId);
  const supabase = await createClient();

  const results = await Promise.all(
    memberIds.map(async (memberId) => {
      const { data } = await supabase.rpc("fn_get_registration_member_id_number", {
        p_member_id: memberId,
      });
      return { memberId, idNumber: (data as string | null) ?? null };
    })
  );

  return results;
}
