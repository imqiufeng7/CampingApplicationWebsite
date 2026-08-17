"use client";

import { useActionState } from "react";
import {
  updateRegistrationReview,
  type ActionState,
} from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function ReviewPanel({
  sessionId,
  registrationId,
  registration,
  editable,
}: {
  sessionId: string;
  registrationId: string;
  registration: Database["public"]["Tables"]["registrations"]["Row"];
  editable: boolean;
}) {
  const action = updateRegistrationReview.bind(null, sessionId, registrationId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <fieldset disabled={!editable} className="contents">
        <div className="grid gap-2">
          <Label htmlFor="review_status">
            審核結果（{registration.review_status}，系統依成員繳費狀態自動判定，僅可手動標記/取消退回補件）
          </Label>
          <select
            id="review_status"
            name="review_status"
            defaultValue={registration.review_status}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value={registration.review_status}>
              {registration.review_status === "退回補件" ? "退回補件（維持）" : `${registration.review_status}（維持自動判定）`}
            </option>
            {registration.review_status === "退回補件" ? (
              <option value="審核中">取消退回補件（改回等待審核）</option>
            ) : (
              <option value="退回補件">標記退回補件</option>
            )}
          </select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="resubmission_reason">需補件原因（設為「退回補件」時填寫，儲存後會自動 email 通知報名者）</Label>
          <Textarea
            id="resubmission_reason"
            name="resubmission_reason"
            defaultValue={registration.resubmission_reason ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="admission_status">錄取結果</Label>
          <select
            id="admission_status"
            name="admission_status"
            defaultValue={registration.admission_status}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="待確認">待確認</option>
            <option value="正取">正取</option>
            <option value="備取">備取</option>
            <option value="取消">取消</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="waitlist_rank">備取順位</Label>
          <Input
            id="waitlist_rank"
            name="waitlist_rank"
            type="number"
            defaultValue={registration.waitlist_rank ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="group_zone">分組區域</Label>
          <Input id="group_zone" name="group_zone" defaultValue={registration.group_zone ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="group_number">帳篷編號</Label>
          <Input
            id="group_number"
            name="group_number"
            defaultValue={registration.group_number ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tent_type">帳篷類型</Label>
          <Input id="tent_type" name="tent_type" defaultValue={registration.tent_type ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sleeping_bag_own_qty">睡袋(墊)自備數量</Label>
          <Input
            id="sleeping_bag_own_qty"
            name="sleeping_bag_own_qty"
            type="number"
            defaultValue={registration.sleeping_bag_own_qty}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sleeping_bag_rent_qty">睡袋(墊)租借數量</Label>
          <Input
            id="sleeping_bag_rent_qty"
            name="sleeping_bag_rent_qty"
            type="number"
            defaultValue={registration.sleeping_bag_rent_qty}
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="is_cancelled"
            name="is_cancelled"
            defaultChecked={registration.is_cancelled}
          />
          <Label htmlFor="is_cancelled">此筆報名已取消</Label>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="cancel_reason">取消原因</Label>
          <Input
            id="cancel_reason"
            name="cancel_reason"
            defaultValue={registration.cancel_reason ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="refund_amount">退費金額</Label>
          <Input
            id="refund_amount"
            name="refund_amount"
            type="number"
            step="0.01"
            defaultValue={registration.refund_amount ?? ""}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="refund_status">退費狀態</Label>
          <select
            id="refund_status"
            name="refund_status"
            defaultValue={registration.refund_status ?? ""}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="">（無）</option>
            <option value="待退">待退</option>
            <option value="已退">已退</option>
          </select>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="admin_note">備註</Label>
          <Textarea id="admin_note" name="admin_note" defaultValue={registration.admin_note ?? ""} />
        </div>

        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        {editable && (
          <div className="sm:col-span-2">
            <SubmitButton>儲存審核結果</SubmitButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}
