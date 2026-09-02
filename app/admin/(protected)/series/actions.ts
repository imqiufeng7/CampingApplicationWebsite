"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/guards";
import {
  seriesSchema,
  sessionSchema,
  identityTypeSchema,
  feeCategorySchema,
  registrationCategorySchema,
} from "@/lib/validation/admin-schemas";
import { deleteRegistrationStorageFiles } from "@/lib/deleteRegistrationFiles";
import type { EmailType } from "@/lib/db/types";

export type ActionState = { error: string | null };

function formToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

// ---------------------------------------------------------------------------
// event_series
// ---------------------------------------------------------------------------
export async function createSeries(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("vendor");

  const parsed = seriesSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_series")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "建立失敗" };
  }

  revalidatePath("/admin/series");
  redirect(`/admin/series/${data.id}`);
}

export async function updateSeries(
  seriesId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const parsed = seriesSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("event_series").update(parsed.data).eq("id", seriesId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// event_sessions
// ---------------------------------------------------------------------------
export async function createSession(
  seriesId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const parsed = sessionSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_sessions")
    .insert({ ...parsed.data, series_id: seriesId })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "建立失敗" };
  }

  revalidatePath(`/admin/series/${seriesId}`);
  redirect(`/admin/series/${seriesId}/sessions/${data.id}`);
}

export async function updateSession(
  seriesId: string,
  sessionId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const parsed = sessionSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("event_sessions").update(parsed.data).eq("id", sessionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Storage upload itself happens client-side (BannerUploadField uploads straight to the
// public session-assets bucket using the vendor's own authenticated session, allowed
// by the vendor_write_session_assets storage RLS policy) — this just persists the
// resulting path onto the session row.
export async function updateSessionBanner(
  seriesId: string,
  sessionId: string,
  bannerImagePath: string | null
): Promise<ActionState> {
  await requireRole("vendor");

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_sessions")
    .update({ banner_image_path: bannerImagePath })
    .eq("id", sessionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Copies a session's settings (fee/capacity/text content/banner) plus its identity
// types and fee categories into a brand-new draft session under targetSeriesId — the
// new session still needs its own name, dates, and open/close window before it's
// usable, so it's created as "draft" rather than inheriting the source's status.
export async function cloneSession(
  targetSeriesId: string,
  sourceSessionId: string
): Promise<{ error: string | null; newSessionId?: string }> {
  await requireRole("vendor");
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("event_sessions")
    .select("*")
    .eq("id", sourceSessionId)
    .maybeSingle();

  if (sourceError || !source) {
    return { error: sourceError?.message ?? "找不到來源場次" };
  }

  const { data: newSession, error: insertError } = await supabase
    .from("event_sessions")
    .insert({
      series_id: targetSeriesId,
      name: `${source.name}（複製）`,
      location: source.location,
      date_start: source.date_start,
      date_end: source.date_end,
      registration_open_at: source.registration_open_at,
      registration_close_at: source.registration_close_at,
      result_announce_at: source.result_announce_at,
      cancel_deadline_at: source.cancel_deadline_at,
      payment_deadline_at: source.payment_deadline_at,
      capacity_total: source.capacity_total,
      admission_quota: source.admission_quota,
      fee_base: source.fee_base,
      fee_discount_per_person: source.fee_discount_per_person,
      max_members_per_registration: source.max_members_per_registration,
      min_members_per_registration: source.min_members_per_registration,
      managing_org: source.managing_org,
      // Every other field is copied verbatim per the vendor's request ("完整複製，我
      // 再依據需要調整") — status is the one deliberate exception, so a clone never
      // goes live/open the moment it's created.
      status: "draft",
      banner_image_path: source.banner_image_path,
      theme_color: source.theme_color,
      consent_gate_text: source.consent_gate_text,
      intro_content: source.intro_content,
      schedule_content: source.schedule_content,
      registration_process_content: source.registration_process_content,
      rules_text: source.rules_text,
      privacy_consent_text: source.privacy_consent_text,
      submit_reminder_text: source.submit_reminder_text,
      success_message_text: source.success_message_text,
      redirect_url: source.redirect_url,
      redirect_label: source.redirect_label,
    })
    .select("id")
    .single();

  if (insertError || !newSession) {
    return { error: insertError?.message ?? "建立失敗" };
  }

  const [{ data: identityTypes }, { data: feeCategories }] = await Promise.all([
    supabase.from("session_identity_types").select("*").eq("session_id", sourceSessionId),
    supabase.from("session_fee_categories").select("*").eq("session_id", sourceSessionId),
  ]);

  if (identityTypes && identityTypes.length > 0) {
    await supabase.from("session_identity_types").insert(
      identityTypes.map((it) => ({
        session_id: newSession.id,
        name: it.name,
        requires_org_field: it.requires_org_field,
        org_options: it.org_options,
        sort_order: it.sort_order,
      }))
    );
  }

  if (feeCategories && feeCategories.length > 0) {
    await supabase.from("session_fee_categories").insert(
      feeCategories.map((fc) => ({
        session_id: newSession.id,
        code: fc.code,
        label: fc.label,
        discount_amount: fc.discount_amount,
        required_document_type: fc.required_document_type,
        applies_to: fc.applies_to,
        auto_approve: fc.auto_approve,
        is_active: fc.is_active,
        sort_order: fc.sort_order,
      }))
    );
  }

  const { data: registrationCategories } = await supabase
    .from("session_registration_categories")
    .select("*")
    .eq("session_id", sourceSessionId);

  if (registrationCategories && registrationCategories.length > 0) {
    await supabase.from("session_registration_categories").insert(
      registrationCategories.map((rc) => ({
        session_id: newSession.id,
        label: rc.label,
        max_members: rc.max_members,
        min_members: rc.min_members,
        capacity_total: rc.capacity_total,
        admission_quota: rc.admission_quota,
        is_free: rc.is_free,
        sort_order: rc.sort_order,
      }))
    );
  }

  revalidatePath(`/admin/series/${targetSeriesId}`);
  return { error: null, newSessionId: newSession.id };
}

// ---------------------------------------------------------------------------
// session_identity_types
// ---------------------------------------------------------------------------
export async function createIdentityType(
  seriesId: string,
  sessionId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const raw = formToObject(formData);
  const parsed = identityTypeSchema.safeParse({
    ...raw,
    requires_org_field: raw.requires_org_field === "on" || raw.requires_org_field === "true",
    org_options: String(raw.org_options ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_identity_types")
    .insert({ ...parsed.data, session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

export async function deleteIdentityType(
  seriesId: string,
  sessionId: string,
  id: string
): Promise<void> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("session_identity_types").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
}

// ---------------------------------------------------------------------------
// session_fee_categories
// ---------------------------------------------------------------------------
export async function createFeeCategory(
  seriesId: string,
  sessionId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const raw = formToObject(formData);
  const parsed = feeCategorySchema.safeParse({
    ...raw,
    auto_approve: raw.auto_approve === "on" || raw.auto_approve === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_fee_categories")
    .insert({ ...parsed.data, session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

export async function updateFeeCategory(
  seriesId: string,
  sessionId: string,
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const raw = formToObject(formData);
  const parsed = feeCategorySchema.safeParse({
    ...raw,
    auto_approve: raw.auto_approve === "on" || raw.auto_approve === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  // sort_order isn't part of this form (drag-and-drop owns it via
  // reorderFeeCategories) — updating only the fields the form actually has means a
  // save here can never reset the category back to position 0.
  const { code, label, discount_amount, required_document_type, applies_to, auto_approve } = parsed.data;
  const { error } = await supabase
    .from("session_fee_categories")
    .update({ code, label, discount_amount, required_document_type, applies_to, auto_approve })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Drag-and-drop reordering — one call per drop, rewrites sort_order for every row so
// the new order survives a reload.
export async function reorderFeeCategories(
  seriesId: string,
  sessionId: string,
  orderedIds: string[]
): Promise<{ error: string | null }> {
  await requireRole("vendor");
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("session_fee_categories").update({ sort_order: index }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return { error: failed.error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Preferred over deleting when a category might be needed again later — keeps its
// document requirement / discount amount / auto_approve setting intact instead of
// having to be rebuilt from scratch.
export async function setFeeCategoryActive(
  seriesId: string,
  sessionId: string,
  id: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_fee_categories")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

export async function deleteFeeCategory(
  seriesId: string,
  sessionId: string,
  id: string
): Promise<void> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("session_fee_categories").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
}

// ---------------------------------------------------------------------------
// session_registration_categories
// ---------------------------------------------------------------------------
export async function createRegistrationCategory(
  seriesId: string,
  sessionId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const raw = formToObject(formData);
  const parsed = registrationCategorySchema.safeParse({
    ...raw,
    is_free: raw.is_free === "on" || raw.is_free === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_registration_categories")
    .insert({ ...parsed.data, session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Unlike identity types / fee categories, this needs a real update path (not just
// create+delete): once a category has any registrations, its FK (on delete restrict)
// makes it undeletable, and admission_quota/capacity_total are exactly the kind of
// numbers organizers tune as an event approaches.
export async function updateRegistrationCategory(
  seriesId: string,
  sessionId: string,
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const raw = formToObject(formData);
  const parsed = registrationCategorySchema.safeParse({
    ...raw,
    is_free: raw.is_free === "on" || raw.is_free === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_registration_categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// Returns { error } instead of throwing — bound directly to a <form action> that
// throws on failure surfaces as an uncaught Next.js error page/digest instead of a
// readable message, which is exactly why the FK-restrict case (report already using
// this category) looked like "the delete button doesn't do anything".
export async function deleteRegistrationCategory(
  seriesId: string,
  sessionId: string,
  id: string
): Promise<{ error: string | null }> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("session_registration_categories").delete().eq("id", id);
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "已經有報名資料使用此類別，無法刪除，請改用編輯調整設定"
          : error.message,
    };
  }
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// session_email_templates (per-session override of the global email_templates row)
// ---------------------------------------------------------------------------
export async function upsertSessionEmailTemplate(
  seriesId: string,
  sessionId: string,
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
  const { error } = await supabase.from("session_email_templates").upsert(
    { session_id: sessionId, type, subject_template: subject, body_template: body },
    { onConflict: "session_id,type" }
  );

  if (error) return { error: error.message };
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

export async function deleteSessionEmailTemplate(
  seriesId: string,
  sessionId: string,
  type: EmailType
): Promise<{ error: string | null }> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_email_templates")
    .delete()
    .eq("session_id", sessionId)
    .eq("type", type);

  if (error) return { error: error.message };
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  return { error: null };
}

// PDPA retention-right tooling: purges every registration (and cascading members/
// files/email logs) for a session, without touching the session record itself — kept
// separate from deleteSession precisely so a vendor can clear out the personal data
// for a session that's long over while keeping the session/event on record for
// historical stats. Deliberately manual/on-demand rather than scheduled — the actual
// retention period is a policy decision the vendor hasn't finalized yet (see the
// PDPA compliance discussion); this is the tool they'll use once it is.
export async function purgeSessionRegistrations(
  seriesId: string,
  sessionId: string
): Promise<{ error: string | null; deletedCount?: number }> {
  await requireRole("vendor");

  const admin = createAdminClient();

  const { data: registrations, error: fetchError } = await admin
    .from("registrations")
    .select("id")
    .eq("session_id", sessionId);

  if (fetchError) {
    return { error: fetchError.message };
  }

  const registrationIds = (registrations ?? []).map((r) => r.id);
  if (registrationIds.length === 0) {
    return { error: null, deletedCount: 0 };
  }

  await deleteRegistrationStorageFiles(admin, registrationIds);

  const { error: deleteError } = await admin.from("registrations").delete().eq("session_id", sessionId);
  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath(`/admin/series/${seriesId}/sessions/${sessionId}`);
  revalidatePath(`/admin/reviews/${sessionId}`);
  revalidatePath(`/admin/payments/${sessionId}`);
  return { error: null, deletedCount: registrationIds.length };
}

// registrations.session_id is ON DELETE RESTRICT (see init_schema.sql) — a session
// with any registrations, even cancelled ones, can't be deleted this way, matching
// the same "can't delete what real data depends on" rule already used for fee/
// registration categories and admin roles.
export async function deleteSession(seriesId: string, sessionId: string): Promise<void> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("event_sessions").delete().eq("id", sessionId);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "此場次已有報名資料，無法刪除"
        : error.message
    );
  }
  revalidatePath(`/admin/series/${seriesId}`);
}
