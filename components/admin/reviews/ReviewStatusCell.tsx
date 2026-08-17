"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditableSelect, EditableText, type ColorSelectOption } from "@/components/admin/reviews/EditableCell";

const REVIEW_STATUS_OPTIONS: ColorSelectOption[] = [
  { value: "審核中", label: "審核中", colorClass: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  { value: "審核通過", label: "審核通過", colorClass: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200" },
  { value: "退回補件", label: "退回補件", colorClass: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
];

const FEE_REVIEW_BADGE_CLASS: Record<string, string> = {
  審核中: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  審核通過: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  無需繳費: "bg-muted text-muted-foreground",
  需繳費: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

type SaveResult = { error: string | null };

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
  const [sending, setSending] = useState(false);

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

  const applicants = members.filter((m) => m.fee_category_id);

  return (
    <div className="grid gap-1.5">
      <EditableSelect
        value={reviewStatus}
        options={REVIEW_STATUS_OPTIONS}
        disabled={disabled}
        onSave={async (v) => {
          const result = await onSaveReviewStatus(v);
          if (!result.error) setLocalStatus(v);
          return result;
        }}
      />

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
          )}
        </div>
      )}

      {applicants.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {applicants.map((m) => (
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
