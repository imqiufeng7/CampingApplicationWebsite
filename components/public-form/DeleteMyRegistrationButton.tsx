"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The real eligibility boundary is enforced server-side in
// fn_delete_registration_via_token (see
// supabase/migrations/20260820130001_self_service_delete.sql) — this prop just decides
// whether to show the button or the "contact the organizer" message, so a registrant
// isn't invited to click something that's guaranteed to fail. Goes through
// /api/registrations/delete-via-token (not a direct RPC call from the browser like the
// edit form uses) because that route also has to clean up the uploaded files in
// Storage, which Postgres itself can't reach.
export function DeleteMyRegistrationButton({
  token,
  eligible,
  registrationNo,
}: {
  token: string;
  eligible: boolean;
  registrationNo: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/registrations/delete-via-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "刪除失敗，請稍後再試。");
        return;
      }
      setDone(true);
    } finally {
      setDeleting(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          報名資料 {registrationNo} 已刪除。
        </CardContent>
      </Card>
    );
  }

  if (!eligible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">刪除我的報名資料</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          此筆報名已完成繳費或已公告錄取結果，無法自助刪除，如需刪除請洽詢主辦單位。
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">刪除我的報名資料</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          這會永久刪除本筆報名 {registrationNo} 的所有資料（含成員資料、上傳文件），此操作無法復原。
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
              {deleting ? "刪除中..." : "確定永久刪除"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
              取消
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="text-destructive w-fit" onClick={() => setConfirming(true)}>
            刪除我的報名資料
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
