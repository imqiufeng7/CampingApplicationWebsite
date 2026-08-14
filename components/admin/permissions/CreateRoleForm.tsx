"use client";

import { useActionState } from "react";
import { createAdminRole, type ActionState } from "@/app/admin/(protected)/permissions/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/admin/SubmitButton";

const initialState: ActionState = { error: null };

export function CreateRoleForm() {
  const [state, formAction] = useActionState(createAdminRole, initialState);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:gap-3">
      <div className="grid gap-2">
        <Label htmlFor="key">角色代碼</Label>
        <Input id="key" name="key" placeholder="例如 volunteer" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="label">角色名稱</Label>
        <Input id="label" name="label" placeholder="例如 志工" required />
      </div>
      <div>
        <SubmitButton>新增角色</SubmitButton>
      </div>
      {state.error && <p className="text-destructive text-sm sm:col-span-3">{state.error}</p>}
    </form>
  );
}
