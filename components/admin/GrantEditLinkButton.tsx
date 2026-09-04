"use client";

import { useState } from "react";
import { toast } from "sonner";
import { grantOneMoreEdit } from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function GrantEditLinkButton({
  sessionId,
  registrationId,
  remainingSelfEdits,
}: {
  sessionId: string;
  registrationId: string;
  remainingSelfEdits: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await grantOneMoreEdit(sessionId, registrationId, reason);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("已寄出修改連結，該筆報名可再存檔一次");
    setOpen(false);
    setReason("");
  }

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">
        修改連結目前：{remainingSelfEdits > 0 ? "已開放（尚未使用）" : "已鎖定"}
      </p>
      {open ? (
        <div className="grid gap-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="開放原因（例：民眾來電要求更換成員），會寫進寄給民眾的信件內容"
            rows={2}
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "寄送中..." : "寄出修改連結"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
          允許再修改一次
        </Button>
      )}
    </div>
  );
}
