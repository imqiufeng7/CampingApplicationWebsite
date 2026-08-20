"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/guards";
import { getEmailAdapter } from "@/lib/email";
import { getGlobalEmailTemplate } from "@/lib/email/getTemplate";
import { renderTemplate } from "@/lib/email/renderTemplate";
import {
  buildAdminInviteVars,
  DEFAULT_ADMIN_INVITE_SUBJECT,
  DEFAULT_ADMIN_INVITE_BODY,
} from "@/lib/email/templates/adminInvite";

export type ActionState = { error: string | null };

// role is now a row in admin_roles rather than a fixed literal, so "valid" means
// "exists" — resolved against the DB rather than a hardcoded string check. Returns
// the role's key (used to decide whether managed_session_ids should be cleared).
async function resolveRoleKey(roleId: FormDataEntryValue | null): Promise<string | null> {
  if (typeof roleId !== "string" || !roleId) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("admin_roles").select("key").eq("id", roleId).maybeSingle();
  return data?.key ?? null;
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

// Generates a fresh "set your password" link (via magiclink/invite — never
// inviteUserByEmail, which relies on Supabase's own rate-limited built-in mailer and
// can't be resent for an existing account) and emails it through our own adapter.
//
// Deliberately does NOT gate this on whether the account "already has a password" —
// last_sign_in_at is not a reliable signal for that: GoTrue stamps it the moment an
// invite/magiclink token is *verified*, which happens before the person ever reaches
// the password form, so anyone who clicked an earlier (possibly broken-redirect)
// invite link already shows as "signed in" despite never setting one. An earlier
// version of this code used that check to block resending and locked a real admin
// out of their own never-activated account. The actual fix for "clicking someone
// else's link touches the wrong account" lives in
// app/admin/accept-invite/page.tsx's urlCarriesAuthToken guard — this link only ever
// works for whoever's inbox it lands in, verified by the token itself, not by
// whatever session happens to be open in the browser that clicks it.
async function sendAccountSetupLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  isNewUser: boolean,
  name: string,
  roleLabel: string
): Promise<{ userId?: string; error?: string }> {
  const redirectTo = `${siteUrl()}/admin/accept-invite`;
  const { data: linkData, error: linkError } = isNewUser
    ? await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } })
    : await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });

  if (linkError || !linkData?.user) {
    return { error: linkError?.message ?? "無法建立邀請連結" };
  }

  // Email our own page URL carrying only the raw token_hash — never Supabase's
  // action_link (a plain GET to auth/v1/verify). Mail providers' link-scanners
  // (Gmail/Outlook safe-links, corporate security proxies) pre-fetch every link in
  // an incoming email to check it for malware, and that GET silently consumes the
  // one-time verify token — so by the time the human actually clicks, it's already
  // "expired". Confirmed happening in production: two invited admins showed
  // confirmed_at/last_sign_in_at stamped 14-18s after the invite was generated,
  // long before they'd opened the email. Our own page (see accept-invite/page.tsx)
  // requires an explicit button click before it calls verifyOtp — scanners fetch
  // URLs, they don't click buttons.
  const setupUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=${linkData.properties.verification_type}`;

  const vars = buildAdminInviteVars({ name, roleLabel, setupUrl });
  const template = await getGlobalEmailTemplate(admin, "管理員邀請", {
    subjectTemplate: DEFAULT_ADMIN_INVITE_SUBJECT,
    bodyTemplate: DEFAULT_ADMIN_INVITE_BODY,
  });

  const adapter = getEmailAdapter();
  const sendResult = await adapter.sendEmail({
    to: email,
    subject: renderTemplate(template.subjectTemplate, vars),
    body: renderTemplate(template.bodyTemplate, vars),
  });

  if (sendResult.status !== "sent") {
    return { userId: linkData.user.id, error: `邀請信寄送失敗：${sendResult.errorMessage ?? "未知錯誤"}` };
  }
  return { userId: linkData.user.id };
}

// Creates the Supabase Auth account (via invite email, so this code never sees or
// sets a password — the invitee picks their own via the emailed link) and the
// matching admin_users row. Only vendor can do this; RLS on admin_users also enforces
// it independently (see supabase/migrations/*_rls_policies.sql).
export async function createAdminUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("vendor");

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const roleId = String(formData.get("role_id") ?? "");
  const managedSessionIds = formData.getAll("managed_session_ids").map(String);

  if (!email) {
    return { error: "請輸入 Email" };
  }
  const roleKey = await resolveRoleKey(roleId);
  if (!roleKey) {
    return { error: "請選擇角色" };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users.find((u) => u.email === email);

  // roleKey (e.g. "vendor") isn't fit for display — fetch the human-readable label
  // for the invite email, same as resendInvite already does below.
  const { data: roleRow } = await admin.from("admin_roles").select("label").eq("id", roleId).maybeSingle();

  const result = await sendAccountSetupLink(admin, email, !existingUser, name, roleRow?.label ?? "");
  if (!result.userId) {
    return { error: result.error ?? "無法建立帳號" };
  }

  const { error: upsertError } = await admin.from("admin_users").upsert(
    {
      id: result.userId,
      email,
      name: name || null,
      role_id: roleId,
      managed_session_ids: roleKey === "vendor" ? [] : managedSessionIds,
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    return { error: upsertError.message };
  }

  revalidatePath("/admin/admins");
  return { error: result.error ? `帳號已設定，但${result.error}` : null };
}

// Re-sends the "set your password" link — see sendAccountSetupLink's comment for why
// this doesn't try to detect "already activated" first.
export async function resendInvite(adminUserId: string): Promise<ActionState> {
  await requireRole("vendor");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("admin_users")
    .select("email, name, role_id")
    .eq("id", adminUserId)
    .maybeSingle();

  if (!row) {
    return { error: "找不到此管理員" };
  }

  const { data: roleRow } = await admin.from("admin_roles").select("label").eq("id", row.role_id).maybeSingle();
  const result = await sendAccountSetupLink(admin, row.email, false, row.name ?? "", roleRow?.label ?? "");
  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/admin/admins");
  return { error: null };
}

export async function updateAdminUser(
  adminUserId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("vendor");

  const roleId = String(formData.get("role_id") ?? "");
  const managedSessionIds = formData.getAll("managed_session_ids").map(String);

  const roleKey = await resolveRoleKey(roleId);
  if (!roleKey) {
    return { error: "請選擇角色" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_users")
    .update({
      role_id: roleId,
      managed_session_ids: roleKey === "vendor" ? [] : managedSessionIds,
    })
    .eq("id", adminUserId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/admins");
  return { error: null };
}

// Only revokes system access (removes the admin_users row) — does not delete the
// underlying Supabase Auth account, so this is a safe, reversible action.
export async function deleteAdminUser(adminUserId: string): Promise<void> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("admin_users").delete().eq("id", adminUserId);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/admin/admins");
}
