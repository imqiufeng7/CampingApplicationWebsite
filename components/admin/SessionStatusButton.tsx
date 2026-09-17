"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSessionRegistrationOpen } from "@/app/admin/(protected)/series/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/db/types";

type EventSessionStatus = Database["public"]["Tables"]["event_sessions"]["Row"]["status"];

const STATUS_LABEL: Record<EventSessionStatus, string> = {
  draft: "草稿",
  open: "開放中",
  closed: "已截止",
  archived: "已封存",
};

// Quick one-click toggle for the two states that actually gate the public form
// (see fn_submit_registration) — the alternative is opening the full 場次設定 form,
// finding the 狀態 dropdown among a dozen other fields, and resubmitting the whole
// thing just to stop new registrations coming in.
export function SessionStatusButton({
  seriesId,
  sessionId,
  status,
}: {
  seriesId: string;
  sessionId: string;
  status: EventSessionStatus;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function toggle(open: boolean) {
    setPending(true);
    try {
      const result = await setSessionRegistrationOpen(seriesId, sessionId, open);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(open ? "已重新開放報名" : "已關閉報名");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">
        目前狀態：<Badge variant={status === "open" ? "default" : "secondary"}>{STATUS_LABEL[status]}</Badge>
      </span>
      {status === "open" ? (
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => toggle(false)}>
          {pending ? "處理中..." : "關閉報名"}
        </Button>
      ) : (
        <Button type="button" size="sm" disabled={pending} onClick={() => toggle(true)}>
          {pending ? "處理中..." : "重新開放報名"}
        </Button>
      )}
      {status !== "open" && status !== "closed" && (
        <span className="text-muted-foreground text-xs">
          （{STATUS_LABEL[status]}狀態，按下按鈕會直接切換為開放中）
        </span>
      )}
    </div>
  );
}
