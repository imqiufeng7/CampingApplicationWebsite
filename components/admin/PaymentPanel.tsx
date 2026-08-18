"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  updateRegistrationPayment,
  extendPaymentDeadlineAndResend,
  resendPaymentNotice,
  type ActionState,
} from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { isoToTaipeiInputValue, TAIPEI_TIME_ZONE } from "@/lib/timezone";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function PaymentPanel({
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
  const action = updateRegistrationPayment.bind(null, sessionId, registrationId);
  const [state, formAction] = useActionState(action, initialState);
  const [generating, setGenerating] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(isoToTaipeiInputValue(registration.payment_deadline));
  const [extending, setExtending] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();

  const [deadlinePassed, setDeadlinePassed] = useState(false);
  useEffect(() => {
    const deadline = registration.payment_deadline;
    Promise.resolve().then(() => {
      setDeadlinePassed(deadline ? new Date(deadline).getTime() < Date.now() : false);
    });
  }, [registration.payment_deadline]);

  async function handleExtendDeadline() {
    setExtending(true);
    try {
      const result = await extendPaymentDeadlineAndResend(sessionId, registrationId, deadlineInput);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已更新繳費期限並重新寄送通知");
      router.refresh();
    } finally {
      setExtending(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const result = await resendPaymentNotice(sessionId, registrationId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已重新寄送繳費通知");
    } finally {
      setResending(false);
    }
  }

  async function handleGenerateLink() {
    setGenerating(true);
    try {
      const res = await fetch("/api/payments/ecpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "建立付款連結失敗");
        return;
      }
      toast.success("已建立線上付款連結");
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <p className="text-muted-foreground text-sm sm:col-span-2">
        繳費狀態與金額會依成員的減免審核結果自動計算（需繳費人數 ×
        每人報名費）；此處僅在需要人工調整或確認「已完成」時使用，一旦標記為已完成就不會再被自動覆蓋。
      </p>
      <fieldset disabled={!editable} className="contents">
        <div className="grid gap-2">
          <Label htmlFor="payment_status">繳費狀態</Label>
          <select
            id="payment_status"
            name="payment_status"
            defaultValue={registration.payment_status}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="無需繳費">無需繳費</option>
            <option value="待繳費">待繳費</option>
            <option value="已完成">已完成</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment_amount">應繳金額</Label>
          <Input
            id="payment_amount"
            name="payment_amount"
            type="number"
            step="0.01"
            defaultValue={registration.payment_amount}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="payment_method">繳費方式</Label>
          <select
            id="payment_method"
            name="payment_method"
            defaultValue={registration.payment_method ?? ""}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="">（未設定）</option>
            <option value="online">線上刷卡/ATM（綠界）</option>
            <option value="manual">人工轉帳</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="manual_transfer_last5">轉帳帳號後五碼</Label>
          <Input
            id="manual_transfer_last5"
            name="manual_transfer_last5"
            defaultValue={registration.manual_transfer_last5 ?? ""}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="manual_transfer_note">轉帳備註</Label>
          <Textarea
            id="manual_transfer_note"
            name="manual_transfer_note"
            defaultValue={registration.manual_transfer_note ?? ""}
          />
        </div>

        {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
        {editable && (
          <div className="sm:col-span-2">
            <SubmitButton>儲存繳費資訊</SubmitButton>
          </div>
        )}
      </fieldset>

      <div className="sm:col-span-2 grid gap-1.5">
        {registration.ecpay_link && (
          <p className="text-muted-foreground text-sm">
            綠界付款連結：
            <a
              href={registration.ecpay_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              {registration.ecpay_link}
            </a>
          </p>
        )}
        {editable && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={handleGenerateLink}
            >
              {generating
                ? "建立中..."
                : registration.ecpay_link
                  ? "重新產生付款連結"
                  : "建立線上付款連結"}
            </Button>
            {registration.ecpay_link && (
              <p className="text-muted-foreground mt-1 text-xs">
                若連結網址看起來不正確（例如網域不是正式網址），請點此重新產生。
              </p>
            )}
          </div>
        )}
      </div>

      <div className="sm:col-span-2 grid gap-2 rounded-lg border p-3">
        <Label>繳費期限</Label>
        <p className="text-sm">
          {registration.payment_deadline ? (
            <>
              {new Date(registration.payment_deadline).toLocaleString("zh-TW", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: TAIPEI_TIME_ZONE,
              })}
              {deadlinePassed && <span className="text-destructive ml-2 font-medium">已逾期</span>}
            </>
          ) : (
            <span className="text-muted-foreground">未設定</span>
          )}
        </p>
        {editable && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="datetime-local"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="h-8 w-auto"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extending}
                onClick={handleExtendDeadline}
              >
                {extending ? "處理中..." : "更新期限並重新寄送通知"}
              </Button>
            </div>
            <div>
              <Button type="button" variant="ghost" size="sm" disabled={resending} onClick={handleResend}>
                {resending ? "寄送中..." : "重新寄送繳費通知（不變更期限）"}
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
