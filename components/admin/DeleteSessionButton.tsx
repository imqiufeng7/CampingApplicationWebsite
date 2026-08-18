"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteSession } from "@/app/admin/(protected)/series/actions";

// registrations.session_id is ON DELETE RESTRICT, so this will fail with a friendly
// message (thrown by the action) if the session still has any registrations —
// deletion only actually succeeds for empty/test sessions.
export function DeleteSessionButton({
  seriesId,
  sessionId,
  sessionName,
}: {
  seriesId: string;
  sessionId: string;
  sessionName: string;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!window.confirm(`確定要刪除場次「${sessionName}」嗎？此操作無法復原。`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSession(seriesId, sessionId);
      toast.success("已刪除場次");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刪除失敗");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={deleting} onClick={handleDelete}>
      {deleting ? "刪除中..." : "刪除"}
    </Button>
  );
}
