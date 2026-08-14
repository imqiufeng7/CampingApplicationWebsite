"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import {
  seriesSchema,
  sessionSchema,
  identityTypeSchema,
  feeCategorySchema,
} from "@/lib/validation/admin-schemas";

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
      capacity_total: source.capacity_total,
      admission_quota: source.admission_quota,
      fee_base: source.fee_base,
      fee_discount_per_person: source.fee_discount_per_person,
      max_members_per_registration: source.max_members_per_registration,
      managing_org: source.managing_org,
      status: "draft",
      banner_image_path: source.banner_image_path,
      schedule_content: source.schedule_content,
      registration_process_content: source.registration_process_content,
      fee_waiver_content: source.fee_waiver_content,
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
        sort_order: fc.sort_order,
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
