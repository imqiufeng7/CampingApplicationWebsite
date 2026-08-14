"use client";

import { useActionState } from "react";
import {
  createFeeCategory,
  deleteFeeCategory,
  type ActionState,
} from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function FeeCategoryEditor({
  seriesId,
  sessionId,
  feeCategories,
}: {
  seriesId: string;
  sessionId: string;
  feeCategories: Database["public"]["Tables"]["session_fee_categories"]["Row"][];
}) {
  const action = createFeeCategory.bind(null, seriesId, sessionId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {feeCategories.map((fc) => (
          <div key={fc.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">
                {fc.code ? `${fc.code} ` : ""}
                {fc.label}
                <span className="text-muted-foreground ml-2 text-sm">({fc.applies_to})</span>
                {fc.auto_approve && (
                  <Badge variant="secondary" className="ml-2">
                    自動免審核
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground text-sm">
                減免 {fc.discount_amount} 元
                {fc.required_document_type ? `・應附文件：${fc.required_document_type}` : ""}
              </p>
            </div>
            <form action={deleteFeeCategory.bind(null, seriesId, sessionId, fc.id)}>
              <Button type="submit" variant="ghost" size="sm">
                刪除
              </Button>
            </form>
          </div>
        ))}
        {feeCategories.length === 0 && (
          <p className="text-muted-foreground text-sm">尚未設定免付費/減免類別</p>
        )}
      </div>

      <form action={formAction} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="fc-code">代碼</Label>
          <Input id="fc-code" name="code" placeholder="例：(一)" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-label">類別名稱</Label>
          <Input id="fc-label" name="label" required placeholder="例：低收入戶" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-applies-to">類型</Label>
          <select
            id="fc-applies-to"
            name="applies_to"
            defaultValue="減免"
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="免付費">免付費</option>
            <option value="減免">減免</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fc-discount">減免金額</Label>
          <Input id="fc-discount" name="discount_amount" type="number" step="0.01" defaultValue={0} />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="fc-doc">應檢附證明文件</Label>
          <Input id="fc-doc" name="required_document_type" placeholder="例：低收入戶證明" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="fc-auto-approve" name="auto_approve" />
          <Label htmlFor="fc-auto-approve" className="font-normal">
            選取後不需審核，錄取後自動免繳費（例：自備帳篷/睡袋者）
          </Label>
        </div>
        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        <div className="sm:col-span-2">
          <SubmitButton>新增類別</SubmitButton>
        </div>
      </form>
    </div>
  );
}
