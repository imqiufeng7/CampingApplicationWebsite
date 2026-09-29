"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSessionDateRange, formatTentNo } from "@/lib/email/templates/preEventNotice";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";
import type { NoticeReplyData } from "@/lib/noticeReply";

function formatRepliedAt(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: TAIPEI_TIME_ZONE,
  });
}

export function NoticeReplyForm({
  token,
  data,
  isSample,
}: {
  token: string;
  data: NoticeReplyData;
  isSample: boolean;
}) {
  const [plate, setPlate] = useState(data.plate_number ?? "");
  const [repliedAt, setRepliedAt] = useState(data.replied_at);
  const [editing, setEditing] = useState(!data.replied_at);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tentNo = formatTentNo(data.group_zone, data.group_number) || "（尚未安排）";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (data.self_pitch && !plate.trim()) {
      setError("請填寫車牌號碼");
      return;
    }
    setSubmitting(true);
    try {
      if (isSample) {
        // Test emails point here — never touch the database.
        setPlate((p) => p.replace(/\s/g, "").toUpperCase());
        setRepliedAt(new Date().toISOString());
        setEditing(false);
        return;
      }
      const supabase = createClient();
      const { data: result, error: rpcError } = await supabase.rpc("fn_submit_notice_reply", {
        p_token: token,
        p_plate_number: data.self_pitch ? plate : null,
      });
      if (rpcError) {
        setError("送出失敗，請稍後再試，或洽詢主辦單位。");
        return;
      }
      setRepliedAt(result);
      setPlate((p) => p.replace(/\s/g, "").toUpperCase());
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-4 p-4 sm:p-8">
      {isSample && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          這是測試信的範例頁面，資料為虛構，按下送出不會寫入任何報名資料。
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>行前通知回覆確認</CardTitle>
          <p className="text-muted-foreground text-sm">
            彰化縣115年災民夜宿體驗活動（{data.session_name}）
            <br />
            {formatSessionDateRange(data.date_start, data.date_end)}
            {data.location && `・${data.location}`}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">報名編號</dt>
            <dd className="font-mono">{data.registration_no}</dd>
            <dt className="text-muted-foreground">主要報名者</dt>
            <dd className="font-medium">{data.leader_name}</dd>
            <dt className="text-muted-foreground">報名類別</dt>
            <dd>{data.category_label ?? "-"}</dd>
            <dt className="text-muted-foreground">帳篷編號</dt>
            <dd className="font-medium">{tentNo}</dd>
            <dt className="text-muted-foreground">參加人數</dt>
            <dd>{data.member_count}人</dd>
            {data.self_pitch && !editing && (
              <>
                <dt className="text-muted-foreground">車牌號碼</dt>
                <dd className="font-medium">{plate}</dd>
              </>
            )}
          </dl>

          {repliedAt && !editing ? (
            <div className="grid gap-3">
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-100">
                ✓ 已於 {formatRepliedAt(repliedAt)} 完成回覆確認，謝謝您！活動當天請出示主要報名者身分證或行前通知信件報到。
              </p>
              {data.self_pitch && (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  修改車牌號碼
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-3">
              {data.self_pitch && (
                <div className="grid gap-2">
                  <Label htmlFor="plate">
                    車牌號碼 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="plate"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="例：ABC-1234"
                    maxLength={20}
                    autoComplete="off"
                  />
                  <p className="text-muted-foreground text-xs">
                    請填寫報到時進場卸帳篷裝備的車輛車牌，以利公所安排。
                  </p>
                </div>
              )}
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "送出中..." : "確認出席"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
