"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditableSelect } from "@/components/admin/reviews/EditableCell";
import { deleteAdminRole, updateFieldPermission } from "@/app/admin/(protected)/permissions/actions";
import type { FieldGroup } from "@/lib/auth/permissions";

const PERMISSION_OPTIONS = [
  { value: "editable", label: "可編輯" },
  { value: "readonly", label: "僅唯讀" },
  { value: "hidden", label: "完全隱藏" },
];

export function RoleMatrixCard({
  role,
  permissions,
  fieldGroups,
}: {
  role: { id: string; key: string; label: string };
  permissions: Map<string, string>;
  fieldGroups: readonly FieldGroup[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          {role.label} <span className="text-muted-foreground font-mono text-xs">({role.key})</span>
        </CardTitle>
        <form action={deleteAdminRole.bind(null, role.id)}>
          <Button type="submit" variant="ghost" size="sm">
            刪除角色
          </Button>
        </form>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {fieldGroups.map((group) => (
          <div key={group} className="flex items-center justify-between gap-2 rounded-lg border p-2">
            <span className="text-sm">{group}</span>
            <EditableSelect
              value={permissions.get(group) ?? "hidden"}
              options={PERMISSION_OPTIONS}
              onSave={(value) =>
                updateFieldPermission(role.id, group, value as "editable" | "readonly" | "hidden")
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
