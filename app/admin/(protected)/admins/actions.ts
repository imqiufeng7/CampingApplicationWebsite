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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const redirectTo = `${siteUrl}/admin/accept-invite`;

  // generateLink() only ever produces a link — it never sends anything itself, unlike
  // inviteUserByEmail() which relies on Supabase's own (rate-limited, easy-to-miss)
  // built-in email sender and has no way to resend for an already-registered account.
  // Sending the link ourselves through the app's own email adapter means one reliable
  // delivery path for both first-time invites and re-invites of an existing admin.
  const { data: existing } = await admin.auth.admin.listUsers();
  const existingUser = existing?.users.find((u) => u.email === email);

  const { data: linkData, error: linkError } = existingUser
    ? await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } })
    : await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });

  if (linkError || !linkData?.user) {
    return { error: linkError?.message ?? "無法建立邀請連結" };
  }
  const userId = linkData.user.id;
  const actionLink = linkData.properties.action_link;

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

  const adapter = getEmailAdapter();
  const sendResult = await adapter.sendEmail({
    to: email,
    subject: "【報名系統後台】您已受邀加入管理團隊",
    body: `您好，

您已被邀請加入報名系統後台，角色為「${roleKey}」。

請點擊以下連結設定登入密碼並開始使用：
${actionLink}

請妥善保存此連結，勿轉發給他人。若非本人申請，請忽略此信。
`,
  });

  if (sendResult.status !== "sent") {
    return { error: `帳號已建立，但邀請信寄送失敗：${sendResult.errorMessage ?? "未知錯誤"}` };
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
