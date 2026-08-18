"use client";

import { cn } from "@/lib/utils";

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

// review_status is entirely system-computed now (see
// fn_recompute_registration_review_status): 審核中 while any member is still 審核中,
// 退回補件 while any member is flagged needs_resubmission (set from the document
// dialog, per person — that's where the reason lives too, not here), otherwise
// 審核通過. This cell is read-only display only.
export function ReviewStatusCell({
  reviewStatus,
  members,
}: {
  reviewStatus: string;
  members: { id: string; name: string; fee_category_id: string | null; fee_review_result: string; needs_resubmission: boolean }[];
}) {
  return (
    <div className="grid gap-1.5">
      <span
        className={cn(
          "w-fit rounded px-1.5 py-0.5 text-sm",
          REVIEW_STATUS_BADGE_CLASS[reviewStatus] ?? "bg-muted text-muted-foreground"
        )}
      >
        {reviewStatus}
      </span>

      {members.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {members.map((m) => (
            <span
              key={m.id}
              title={`${m.name}：${m.fee_review_result}${m.needs_resubmission ? "（需補件）" : ""}`}
              className={cn(
                "rounded px-1 py-0.5 text-[11px] whitespace-nowrap",
                m.needs_resubmission
                  ? "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200"
                  : (FEE_REVIEW_BADGE_CLASS[m.fee_review_result] ?? "bg-muted text-muted-foreground")
              )}
            >
              {m.name}：{m.needs_resubmission ? "需補件" : m.fee_review_result}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
