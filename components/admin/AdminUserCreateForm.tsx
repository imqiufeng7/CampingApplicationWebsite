"use client";

import { useActionState, useState } from "react";
import { createAdminUser, type ActionState } from "@/app/admin/(protected)/admins/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/admin/SubmitButton";

const initialState: ActionState = { error: null };

export function AdminUserCreateForm({
  sessions,
  roles,
}: {
  sessions: { id: string; name: string }[];
  roles: { id: string; key: string; label: string }[];
}) {
  const [state, formAction] = useActionState(createAdminUser, initialState);
  const [roleId, setRoleId] = useState(roles.find((r) => r.key !== "vendor")?.id ?? roles[0]?.id ?? "");
  const isVendorRole = roles.find((r) => r.id === roleId)?.key === "vendor";

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">姓名</Label>
          <Input id="name" name="name" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role_id">角色</Label>
        <select
          id="role_id"
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
      </div>
      {!isVendorRole && (
        <div className="grid gap-2">
          <Label htmlFor="managed_session_ids">可管理場次（可複選）</Label>
          <select
            id="managed_session_ids"
            name="managed_session_ids"
            multiple
            className="border-input min-h-24 rounded-lg border bg-transparent px-2.5 py-1 text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton>寄出邀請</SubmitButton>
      </div>
      <p className="text-muted-foreground text-sm">
        會透過 Supabase Auth 寄出邀請信，對方點擊信件連結後自行設定密碼；此系統不會經手密碼。
      </p>
    </form>
  );
}
