import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { FIELD_GROUPS, type FieldPermissions } from "@/lib/auth/permissions";

export interface CurrentAdmin {
  id: string;
  email: string;
  name: string | null;
  roleId: string;
  roleKey: string;
  roleLabel: string;
  isVendor: boolean;
  managedSessionIds: string[];
  fieldPermissions: FieldPermissions;
  tourSeen: { dashboard: boolean; reviews: boolean; payments: boolean };
}

const ALL_EDITABLE: FieldPermissions = Object.fromEntries(
  FIELD_GROUPS.map((g) => [g, "editable"])
) as FieldPermissions;

// Cached per-request so every server component / server action in the same request
// reuses one lookup instead of re-querying admin_users repeatedly.
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select(
      "id, email, name, role_id, managed_session_ids, dashboard_tour_seen_at, reviews_tour_seen_at, payments_tour_seen_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow) {
    return null;
  }

  const { data: role } = await supabase
    .from("admin_roles")
    .select("id, key, label")
    .eq("id", adminRow.role_id)
    .maybeSingle();

  if (!role) {
    return null;
  }

  const isVendor = role.key === "vendor";

  // vendor is always fully editable everywhere — short-circuit rather than spend an
  // RPC round trip confirming what public.field_permission() would return anyway.
  let fieldPermissions = ALL_EDITABLE;
  if (!isVendor) {
    const { data: rows } = await supabase.rpc("current_field_permissions");
    fieldPermissions = {
      ...Object.fromEntries(FIELD_GROUPS.map((g) => [g, "hidden"])),
      ...Object.fromEntries((rows ?? []).map((r) => [r.field_group, r.permission])),
    } as FieldPermissions;
  }

  return {
    id: adminRow.id,
    email: adminRow.email,
    name: adminRow.name,
    roleId: role.id,
    roleKey: role.key,
    roleLabel: role.label,
    isVendor,
    managedSessionIds: adminRow.managed_session_ids,
    fieldPermissions,
    tourSeen: {
      dashboard: adminRow.dashboard_tour_seen_at !== null,
      reviews: adminRow.reviews_tour_seen_at !== null,
      payments: adminRow.payments_tour_seen_at !== null,
    },
  };
});
