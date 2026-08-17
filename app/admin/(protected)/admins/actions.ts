"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/guards";

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
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/admin/accept-invite`,
  });

  let userId = invited?.user?.id;

  if (inviteError) {
    // Already-registered accounts (e.g. re-adding someone) aren't an error case here —
    // look the existing auth user up instead of failing.
    const { data: existing } = await admin.auth.admin.listUsers();
    const match = existing?.users.find((u) => u.email === email);
    if (!match) {
      return { error: inviteError.message };
    }
    userId = match.id;
  }

  if (!userId) {
    return { error: "無法建立帳號" };
  }

  const { error: insertError } = await admin.from("admin_users").insert({
    id: userId,
    email,
    name: name || null,
    role_id: roleId,
    managed_session_ids: roleKey === "vendor" ? [] : managedSessionIds,
  });

  if (insertError) {
    return { error: insertError.message };
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
