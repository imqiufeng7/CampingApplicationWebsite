"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/guards";
import { getEmailAdapter } from "@/lib/email";

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
// Only ever called for an account that has never actually signed in — an already-
// activated account must never get one of these: clicking it while a *different*
// admin is logged in in the same browser would silently reset the wrong account's
// password (see app/admin/accept-invite/page.tsx's urlCarriesAuthToken guard, added
// after exactly that happened). Already-activated accounts use 忘記密碼 instead.
async function sendAccountSetupLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  isNewUser: boolean,
  roleLabel: string
): Promise<{ userId?: string; error?: string }> {
  const redirectTo = `${siteUrl()}/admin/accept-invite`;
  const { data: linkData, error: linkError } = isNewUser
    ? await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } })
    : await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });

  if (linkError || !linkData?.user) {
    return { error: linkError?.message ?? "無法建立邀請連結" };
  }

  const adapter = getEmailAdapter();
  const sendResult = await adapter.sendEmail({
    to: email,
    subject: "【報名系統後台】您已受邀加入管理團隊",
    body: `您好，

您已被邀請加入報名系統後台，角色為「${roleLabel}」。

請點擊以下連結設定登入密碼並開始使用：
${linkData.properties.action_link}

請妥善保存此連結，勿轉發給他人。若非本人申請，請忽略此信。
`,
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
  const isActivated = !!existingUser?.last_sign_in_at;

  let userId = existingUser?.id;
  let emailError: string | null = null;

  if (isActivated) {
    // Already has a working password — adding them here is a role/permission change,
    // not an invite. No password-set link is generated at all; just a plain notice.
    const adapter = getEmailAdapter();
    const sendResult = await adapter.sendEmail({
      to: email,
      subject: "【報名系統後台】您的權限已更新",
      body: `您好，

您在報名系統後台的角色已設定為「${roleKey}」，請直接使用原密碼登入：
${siteUrl()}/admin/login

如忘記密碼，可在登入頁使用「忘記密碼」重設。
`,
    });
    if (sendResult.status !== "sent") {
      emailError = `通知信寄送失敗：${sendResult.errorMessage ?? "未知錯誤"}`;
    }
  } else {
    const result = await sendAccountSetupLink(admin, email, !existingUser, roleKey);
    if (!result.userId) {
      return { error: result.error ?? "無法建立帳號" };
    }
    userId = result.userId;
    emailError = result.error ?? null;
  }

  if (!userId) {
    return { error: "無法建立帳號" };
  }

  const { error: upsertError } = await admin.from("admin_users").upsert(
    {
      id: userId,
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
  return { error: emailError ? `帳號已設定，但${emailError}` : null };
}

// Re-sends the "set your password" link for an admin who was invited but never
// actually activated their account (last_sign_in_at is null). Refuses for an
// already-activated account — direct them to 忘記密碼 instead, since re-issuing a
// password-set link for a working account is exactly the footgun described above.
export async function resendInvite(adminUserId: string): Promise<ActionState> {
  await requireRole("vendor");

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("admin_users")
    .select("email, role_id")
    .eq("id", adminUserId)
    .maybeSingle();

  if (!row) {
    return { error: "找不到此管理員" };
  }

  const { data: userResp } = await admin.auth.admin.getUserById(adminUserId);
  if (userResp?.user?.last_sign_in_at) {
    return { error: "此帳號已經啟用過，如對方忘記密碼，請對方在登入頁使用「忘記密碼」功能自行重設" };
  }

  const { data: roleRow } = await admin.from("admin_roles").select("label").eq("id", row.role_id).maybeSingle();
  const result = await sendAccountSetupLink(admin, row.email, false, roleRow?.label ?? "");
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
