"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { purgeSessionRegistrations } from "@/app/admin/(protected)/series/actions";

const CONFIRM_WORD = "刪除";

// Bulk, irreversible, affects many people's personal data at once — a plain
// window.confirm() (used elsewhere for single-row deletes) isn't enough friction here.
// Requires typing the confirm word before the button even enables.
export function PurgeRegistrationsButton({
  seriesId,
  sessionId,
  registrationCount,
}: {
  seriesId: string;
  sessionId: string;
  registrationCount: number;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [purging, setPurging] = useState(false);
  const router = useRouter();

  if (registrationCount === 0) {
    return <p className="text-muted-foreground text-sm">此場次目前沒有報名資料。</p>;
  }

  async function handlePurge() {
    setPurging(true);
    try {
      const result = await purgeSessionRegistrations(seriesId, sessionId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`已刪除 ${result.deletedCount ?? 0} 筆報名資料`);
      setConfirmText("");
      router.refresh();
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm">
        此場次目前有 <span className="font-semibold">{registrationCount}</span> 筆報名資料。這會永久刪除所有報名者的個人資料（含成員資料、上傳文件、繳費紀錄），僅保留場次本身與異動紀錄，此操作無法復原。
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="purge-confirm">請輸入「{CONFIRM_WORD}」以啟用刪除按鈕</Label>
        <Input
          id="purge-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-40"
        />
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-fit"
        disabled={confirmText !== CONFIRM_WORD || purging}
        onClick={handlePurge}
      >
        {purging ? "刪除中..." : `永久刪除全部 ${registrationCount} 筆報名資料`}
      </Button>
    </div>
  );
}
