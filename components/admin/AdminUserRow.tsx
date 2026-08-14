"use client";

import { useActionState, useState } from "react";
import {
  updateAdminUser,
  deleteAdminUser,
  type ActionState,
} from "@/app/admin/(protected)/admins/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/admin/SubmitButton";

const initialState: ActionState = { error: null };

export function AdminUserRow({
  adminUser,
  sessions,
  roles,
}: {
  adminUser: {
    id: string;
    email: string;
    name: string | null;
    role_id: string;
    managed_session_ids: string[];
  };
  sessions: { id: string; name: string }[];
  roles: { id: string; key: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [roleId, setRoleId] = useState(adminUser.role_id);
  const action = updateAdminUser.bind(null, adminUser.id);
  const [state, formAction] = useActionState(action, initialState);

  const roleLabel = roles.find((r) => r.id === adminUser.role_id)?.label ?? "未知角色";
  const isVendorRole = roles.find((r) => r.id === roleId)?.key === "vendor";

  const sessionNames = sessions
    .filter((s) => adminUser.managed_session_ids.includes(s.id))
    .map((s) => s.name);

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="font-medium">
            {adminUser.name ?? adminUser.email} <span className="text-muted-foreground">({roleLabel})</span>
          </p>
          <p className="text-muted-foreground text-sm">{adminUser.email}</p>
          {sessionNames.length > 0 && (
            <p className="text-muted-foreground text-sm">可管理場次：{sessionNames.join("、")}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            編輯
          </Button>
          <form action={deleteAdminUser.bind(null, adminUser.id)}>
            <Button type="submit" variant="ghost" size="sm">
              移除
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-3">
      <p className="font-medium">{adminUser.email}</p>
      <select
        name="role_id"
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
            {r.key === "vendor" ? "（全權）" : ""}
          </option>
        ))}
      </select>
      {!isVendorRole && (
        <select
          name="managed_session_ids"
          multiple
          defaultValue={adminUser.managed_session_ids}
          className="border-input min-h-24 rounded-lg border bg-transparent px-2.5 py-1 text-sm"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton>儲存</SubmitButton>
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          取消
        </Button>
      </div>
    </form>
  );
}
