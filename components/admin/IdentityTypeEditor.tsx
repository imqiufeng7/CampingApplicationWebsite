"use client";

import { useActionState } from "react";
import {
  createIdentityType,
  deleteIdentityType,
  type ActionState,
} from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function IdentityTypeEditor({
  seriesId,
  sessionId,
  identityTypes,
}: {
  seriesId: string;
  sessionId: string;
  identityTypes: Database["public"]["Tables"]["session_identity_types"]["Row"][];
}) {
  const action = createIdentityType.bind(null, seriesId, sessionId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {identityTypes.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{it.name}</p>
              {it.requires_org_field && (
                <p className="text-muted-foreground text-sm">
                  單位選項：{(it.org_options as unknown as string[]).join("、")}
                </p>
              )}
            </div>
            <form action={deleteIdentityType.bind(null, seriesId, sessionId, it.id)}>
              <Button type="submit" variant="ghost" size="sm">
                刪除
              </Button>
            </form>
          </div>
        ))}
        {identityTypes.length === 0 && (
          <p className="text-muted-foreground text-sm">尚未設定身分別</p>
        )}
      </div>

      <form action={formAction} className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-2">
          <Label htmlFor="it-name">身分別名稱</Label>
          <Input id="it-name" name="name" required placeholder="例：工作人員" />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="it-requires-org" name="requires_org_field" />
          <Label htmlFor="it-requires-org">需要選擇所屬單位</Label>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="it-org-options">單位選項（逗號分隔）</Label>
          <Input
            id="it-org-options"
            name="org_options"
            placeholder="公所,消防局,社會處,衛生局,警察局,社區,民間團體,其他"
          />
        </div>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        <div>
          <SubmitButton>新增身分別</SubmitButton>
        </div>
      </form>
    </div>
  );
}
