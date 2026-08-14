import { getCurrentAdmin, type CurrentAdmin } from "@/lib/auth/session";
import type { FieldGroup } from "@/lib/auth/permissions";

export class ForbiddenError extends Error {
  constructor(message = "沒有權限執行此操作") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Friendly, server-action-level pre-check. This is a UX nicety only — the database
// (RLS + column-permission triggers, see supabase/migrations) is the real boundary,
// so this check being missed or wrong somewhere never becomes a security hole.
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new ForbiddenError("尚未登入");
  }
  return admin;
}

// Only 'vendor' remains a role name compared literally anywhere in this app — it's
// the one protected system role (see supabase/migrations/20260731090001_role_matrix_schema.sql).
// Every other role is data now, so use requireFieldEditable for field-level checks
// instead of naming a role here.
export async function requireRole(...roleKeys: string[]): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (!roleKeys.includes(admin.roleKey)) {
    throw new ForbiddenError(`此操作僅限 ${roleKeys.join("/")} 角色`);
  }
  return admin;
}

// Field-level equivalent of requireRole, driven by field_permission_matrix instead of
// a hardcoded role name. Real boundary is still the DB (column-permission triggers /
// public.field_permission()); this is the friendly pre-check.
export async function requireFieldEditable(
  admin: CurrentAdmin,
  group: FieldGroup
): Promise<void> {
  if (admin.fieldPermissions[group] !== "editable") {
    throw new ForbiddenError(`此操作需要「${group}」欄位群組的編輯權限`);
  }
}

export function hasSessionAccess(admin: CurrentAdmin, sessionId: string): boolean {
  return admin.isVendor || admin.managedSessionIds.includes(sessionId);
}

export async function requireSessionAccess(sessionId: string): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (!hasSessionAccess(admin, sessionId)) {
    throw new ForbiddenError("沒有權限存取此場次");
  }
  return admin;
}
