"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cloneSession } from "@/app/admin/(protected)/series/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CloneSessionForm({
  seriesId,
  otherSessions,
}: {
  seriesId: string;
  otherSessions: { id: string; name: string; seriesName: string }[];
}) {
  const [sourceId, setSourceId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (otherSessions.length === 0) {
    return null;
  }

  function handleClone() {
    if (!sourceId) return;
    startTransition(async () => {
      const result = await cloneSession(seriesId, sourceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已複製場次設定，請確認場次名稱與開放時間");
      if (result.newSessionId) {
        router.push(`/admin/series/${seriesId}/sessions/${result.newSessionId}`);
      }
    });
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <Label htmlFor="clone-source">從現有場次複製設定（身分別、減免類別、活動說明等）</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="clone-source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
        >
          <option value="">請選擇來源場次</option>
          {otherSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.seriesName} - {s.name}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" disabled={!sourceId || pending} onClick={handleClone}>
          {pending ? "複製中..." : "複製並建立新場次"}
        </Button>
      </div>
    </div>
  );
}
