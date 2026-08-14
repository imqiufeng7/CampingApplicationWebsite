import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FIELD_GROUPS } from "@/lib/auth/permissions";
import { CreateRoleForm } from "@/components/admin/permissions/CreateRoleForm";
import { RoleMatrixCard } from "@/components/admin/permissions/RoleMatrixCard";

export default async function PermissionsPage() {
  await requireRole("vendor");
  const supabase = await createClient();

  const [{ data: roles }, { data: matrixRows }] = await Promise.all([
    supabase.from("admin_roles").select("id, key, label, is_system").order("is_system", { ascending: false }),
    supabase.from("field_permission_matrix").select("role_id, field_group, permission"),
  ]);

  const permissionsByRole = new Map<string, Map<string, string>>();
  for (const row of matrixRows ?? []) {
    const map = permissionsByRole.get(row.role_id) ?? new Map();
    map.set(row.field_group, row.permission);
    permissionsByRole.set(row.role_id, map);
  }

  const customRoles = (roles ?? []).filter((r) => !r.is_system);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-lg font-semibold">權限設定</h1>
        <p className="text-muted-foreground text-sm">
          廠商角色不受此頁限制，永遠擁有全部欄位群組的編輯權限。以下角色可自訂每個欄位群組是「可編輯／僅唯讀／完全隱藏」。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新增角色</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateRoleForm />
        </CardContent>
      </Card>

      {customRoles.map((role) => (
        <RoleMatrixCard
          key={role.id}
          role={role}
          permissions={permissionsByRole.get(role.id) ?? new Map()}
          fieldGroups={FIELD_GROUPS}
        />
      ))}
      {customRoles.length === 0 && (
        <p className="text-muted-foreground text-sm">目前沒有可設定的角色（廠商角色不需要設定）</p>
      )}
    </div>
  );
}
