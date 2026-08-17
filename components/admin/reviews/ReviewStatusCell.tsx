"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditableText } from "@/components/admin/reviews/EditableCell";

const REVIEW_STATUS_BADGE_CLASS: Record<string, string> = {
  審核中: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  審核通過: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  退回補件: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

const FEE_REVIEW_BADGE_CLASS: Record<string, string> = {
  審核中: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  無需繳費: "bg-muted text-muted-foreground",
  需繳費: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

type SaveResult = { error: string | null };

// review_status is system-computed now (審核中 while any member is still 審核中,
// otherwise 審核通過 — see fn_recompute_registration_review_status) — this cell shows
// it read-only and only exposes 退回補件 as a deliberate manual action, rather than a
// free-form dropdown that the next member-status change would silently overwrite.
export function ReviewStatusCell({
  sessionId,
  registrationId,
  reviewStatus,
  resubmissionReason,
  members,
  disabled,
  onSaveReviewStatus,
  onSaveReason,
}: {
  sessionId: string;
  registrationId: string;
  reviewStatus: string;
  resubmissionReason: string;
  members: { id: string; name: string; fee_category_id: string | null; fee_review_result: string }[];
  disabled: boolean;
  onSaveReviewStatus: (value: string) => Promise<SaveResult>;
  onSaveReason: (value: string) => Promise<SaveResult>;
}) {
  const [localStatus, setLocalStatus] = useState(reviewStatus);
  const [markingResubmission, setMarkingResubmission] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleMark() {
    const result = await onSaveReviewStatus("退回補件");
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLocalStatus("退回補件");
  }

  async function handleClear() {
    const result = await onSaveReviewStatus("審核中");
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLocalStatus("審核中");
    setMarkingResubmission(false);
  }

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/send-resubmission-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "寄送失敗");
        return;
      }
      toast.success("已寄送補件通知");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <span
        className={cn(
          "w-fit rounded px-1.5 py-0.5 text-sm",
          REVIEW_STATUS_BADGE_CLASS[localStatus] ?? "bg-muted text-muted-foreground"
        )}
      >
        {localStatus}
      </span>

      {!disabled && localStatus !== "退回補件" && !markingResubmission && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 w-fit text-xs"
          onClick={() => setMarkingResubmission(true)}
        >
          標記退回補件
        </Button>
      )}

      {!disabled && localStatus !== "退回補件" && markingResubmission && (
        <div className="grid gap-1 rounded-md border border-destructive/40 p-1.5">
          <EditableText
            value={resubmissionReason}
            placeholder="需補件原因"
            disabled={disabled}
            className="h-7 w-full text-xs"
            onSave={onSaveReason}
          />
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={handleMark}>
              確認標記
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => setMarkingResubmission(false)}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {localStatus === "退回補件" && (
        <div className="grid gap-1 rounded-md border border-destructive/40 p-1.5">
          <EditableText
            value={resubmissionReason}
            placeholder="需補件原因"
            disabled={disabled}
            className="h-7 w-full text-xs"
            onSave={onSaveReason}
          />
          {!disabled && (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                disabled={sending}
                onClick={handleSend}
              >
                {sending ? "寄送中..." : "寄送補件通知"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={handleClear}>
                取消退回補件
              </Button>
            </div>
          )}
        </div>
      )}

      {members.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {members.map((m) => (
            <span
              key={m.id}
              title={`${m.name}：${m.fee_review_result}`}
              className={cn(
                "rounded px-1 py-0.5 text-[11px] whitespace-nowrap",
                FEE_REVIEW_BADGE_CLASS[m.fee_review_result] ?? "bg-muted text-muted-foreground"
              )}
            >
              {m.name}：{m.fee_review_result}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
