"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { FIELD_GROUPS, type FieldGroup, type PermissionLevel } from "@/lib/auth/permissions";

export type ActionState = { error: string | null };

// New roles start fully locked down (every group 'hidden') — vendor opts fields in
// explicitly rather than a new role accidentally inheriting broad access.
export async function createAdminRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("vendor");

  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();

  if (!key || !label) {
    return { error: "請輸入角色代碼與名稱" };
  }
  if (!/^[a-z0-9_]+$/.test(key)) {
    return { error: "角色代碼只能用小寫英文字母、數字、底線" };
  }

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("admin_roles")
    .insert({ key, label, is_system: false })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const { error: matrixError } = await supabase.from("field_permission_matrix").insert(
    FIELD_GROUPS.map((field_group) => ({
      role_id: role.id,
      field_group,
      permission: "hidden" as PermissionLevel,
    }))
  );

  if (matrixError) {
    return { error: matrixError.message };
  }

  revalidatePath("/admin/permissions");
  return { error: null };
}

// is_system rows (vendor) and roles still assigned to an admin_users row are
// protected — the former by RLS (see 20260731090003_admin_roles_rls.sql), the latter
// by the FK's default RESTRICT behavior on admin_users.role_id, surfaced here as a
// friendly message instead of a raw FK-violation error.
export async function deleteAdminRole(roleId: string): Promise<void> {
  await requireRole("vendor");
  const supabase = await createClient();
  const { error } = await supabase.from("admin_roles").delete().eq("id", roleId);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "還有管理員帳號使用此角色，請先改指派其他角色再刪除"
        : error.message
    );
  }
  revalidatePath("/admin/permissions");
}

export async function updateFieldPermission(
  roleId: string,
  fieldGroup: FieldGroup,
  permission: PermissionLevel
): Promise<ActionState> {
  await requireRole("vendor");
  const supabase = await createClient();

  const { error } = await supabase
    .from("field_permission_matrix")
    .update({ permission })
    .eq("role_id", roleId)
    .eq("field_group", fieldGroup);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/permissions");
  return { error: null };
}
