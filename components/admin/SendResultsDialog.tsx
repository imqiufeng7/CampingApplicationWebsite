"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SendResultsDialog({
  sessionId,
  admittedCount,
  waitlistCount,
}: {
  sessionId: string;
  admittedCount: number;
  waitlistCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setSending(true);
    try {
      const res = await fetch("/api/email/send-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "寄送失敗");
        return;
      }
      toast.success(`已寄出 ${json.sent} 封，失敗 ${json.failed} 封（共 ${json.total} 筆）`);
      setOpen(false);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>寄出審核結果通知</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認寄出審核結果通知</DialogTitle>
          <DialogDescription>
            確定要寄出通知給 {admittedCount} 位錄取者、{waitlistCount} 位備取者？此操作無法復原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={sending}>
            {sending ? "寄送中..." : "確認寄出"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
