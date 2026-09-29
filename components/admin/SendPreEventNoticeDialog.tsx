"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CHUNK_SIZE = 15;

type SendResult = { total: number; sent: number; failed: number; skipped: number };

// Sends in small chunks so no single request has to hold open a whole session's
// worth of SMTP round-trips, and so the dialog can show progress.
async function sendInChunks(
  sessionId: string,
  registrationIds: string[],
  resend: boolean,
  onProgress: (done: number) => void
): Promise<SendResult> {
  const totals: SendResult = { total: 0, sent: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < registrationIds.length; i += CHUNK_SIZE) {
    const chunk = registrationIds.slice(i, i + CHUNK_SIZE);
    const res = await fetch("/api/email/send-pre-event-notice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, registrationIds: chunk, resend }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `${json.error ?? "寄送失敗"}（已寄出 ${totals.sent} 封後中斷，重新按寄送會自動略過已寄出的）`
      );
    }
    totals.total += json.total;
    totals.sent += json.sent;
    totals.failed += json.failed;
    totals.skipped += json.skipped;
    onProgress(Math.min(i + CHUNK_SIZE, registrationIds.length));
  }
  return totals;
}

function summary(r: SendResult) {
  return `已寄出 ${r.sent} 封${r.failed ? `，失敗 ${r.failed} 封（請至個別報名頁查看原因）` : ""}${
    r.skipped ? `，略過已寄過 ${r.skipped} 筆` : ""
  }`;
}

export function SendPreEventNoticeDialog({
  sessionId,
  sessionName,
  stats,
  defaultTestEmail,
}: {
  sessionId: string;
  sessionName: string;
  stats: { selfPitch: number; total: number; missingTent: number; alreadySent: number; pendingIds: string[] };
  defaultTestEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [testEmail, setTestEmail] = useState(defaultTestEmail);
  const [testing, setTesting] = useState<"self" | "host" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  const pending = stats.pendingIds.length;

  async function handleTest(selfPitch: boolean) {
    setTesting(selfPitch ? "self" : "host");
    try {
      const res = await fetch("/api/email/send-pre-event-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, testTo: testEmail, testSelfPitch: selfPitch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "測試信寄送失敗");
        return;
      }
      toast.success(`已寄出${selfPitch ? "自搭帳" : "主辦搭設帳"}測試信到 ${testEmail}`);
    } finally {
      setTesting(null);
    }
  }

  async function handleSend() {
    setSending(true);
    setProgress(0);
    try {
      const result = await sendInChunks(sessionId, stats.pendingIds, false, setProgress);
      toast.success(summary(result));
      setOpen(false);
      setConfirmed(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "寄送失敗");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (sending) return;
        setOpen(o);
        if (!o) setConfirmed(false);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>寄送行前通知</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>寄送行前通知（{sessionName}）</DialogTitle>
          <DialogDescription>
            寄送對象：正取、未取消，且已完成繳費或無需繳費的報名。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2 text-center">
              <div className="text-xl font-semibold">{stats.selfPitch}</div>
              <div className="text-muted-foreground text-xs">自搭帳</div>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <div className="text-xl font-semibold">{stats.total - stats.selfPitch}</div>
              <div className="text-muted-foreground text-xs">主辦搭設帳</div>
            </div>
          </div>
          {stats.alreadySent > 0 && (
            <p className="text-muted-foreground">
              其中 {stats.alreadySent} 組已寄過，這次會自動略過（要補寄請在列表勾選後用「寄行前通知給已選取」）。
            </p>
          )}
          {stats.missingTent > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              ⚠ 有 {stats.missingTent} 組尚未安排帳篷編號，信中帳篷編號會顯示「（尚未安排）」。建議先排好再寄。
            </p>
          )}

          <div className="grid gap-2 rounded-lg border p-3">
            <Label htmlFor="notice-test-email">先寄測試信（只寄到這個信箱，不會寄給報名者）</Label>
            <Input
              id="notice-test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!testEmail || testing !== null || sending || stats.selfPitch === 0}
                onClick={() => handleTest(true)}
              >
                {testing === "self" ? "寄送中..." : "寄自搭帳測試信"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!testEmail || testing !== null || sending || stats.total - stats.selfPitch === 0}
                onClick={() => handleTest(false)}
              >
                {testing === "host" ? "寄送中..." : "寄主辦搭設帳測試信"}
              </Button>
            </div>
          </div>

          {pending > 0 ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                disabled={sending}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>我已確認測試信內容，要寄出 {pending} 封行前通知給報名者。此操作無法復原。</span>
            </label>
          ) : (
            <p className="text-muted-foreground">目前沒有尚未寄送的報名。</p>
          )}
          {sending && (
            <p className="text-muted-foreground">
              寄送中… {progress} / {pending}，請勿關閉視窗
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            取消
          </Button>
          <Button onClick={handleSend} disabled={!confirmed || sending || pending === 0}>
            {sending ? "寄送中..." : `確認寄出 ${pending} 封`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Targeted (re)send for the rows checked in the review table — e.g. someone who paid
// after the batch went out, or who says they never got it. Always sends, even if a
// notice already went out, since picking the rows is itself the decision to resend.
export function SendSelectedNoticeDialog({
  sessionId,
  registrationIds,
}: {
  sessionId: string;
  registrationIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  async function handleConfirm() {
    setSending(true);
    setProgress(0);
    try {
      const result = await sendInChunks(sessionId, registrationIds, true, setProgress);
      const ineligible = registrationIds.length - result.total;
      toast.success(`${summary(result)}${ineligible ? `；${ineligible} 筆不符寄送條件已略過` : ""}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "寄送失敗");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" disabled={registrationIds.length === 0} />}
      >
        寄行前通知給已選取（{registrationIds.length}）
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>確認寄出行前通知</DialogTitle>
          <DialogDescription>
            確定要寄出行前通知給已選取的 {registrationIds.length} 筆報名？只會寄給正取、未取消且已完成繳費或無需繳費的報名，其餘會自動略過；已寄過的也會再寄一次。此操作無法復原。
          </DialogDescription>
        </DialogHeader>
        {sending && (
          <p className="text-muted-foreground text-sm">
            寄送中… {progress} / {registrationIds.length}，請勿關閉視窗
          </p>
        )}
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
