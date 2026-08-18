"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteRegistration } from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { formatRegistrationNo } from "@/lib/registrationNo";

// Hard delete, not the reversible is_cancelled flag — confirm() is a deliberately
// blunt guard against a misclick given there's no undo (matches the severity, even
// though other delete buttons in this app don't bother with a confirmation step).
export function DeleteRegistrationButton({
  sessionId,
  registrationId,
  registrationSeq,
}: {
  sessionId: string;
  registrationId: string;
  registrationSeq: number;
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (
      !window.confirm(
        `確定要永久刪除報名 ${formatRegistrationNo(registrationSeq)} 嗎？此操作無法復原，成員資料、上傳文件與繳費紀錄都會一併刪除。`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteRegistration(sessionId, registrationId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已刪除");
      router.refresh();
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
