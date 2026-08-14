"use client";

import { useActionState, useState } from "react";
import { createSession, updateSession, type ActionState } from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { Database } from "@/lib/db/types";

const initialState: ActionState = { error: null };

function toLocalInputValue(value: string | null) {
  if (!value) return "";
  // datetime-local input wants "YYYY-MM-DDTHH:mm"
  return value.slice(0, 16);
}

// Image upload needs a session row to attach images to, so the rich editor is only
// available once the session actually exists (i.e. not on the "新增場次" create
// form) — plain Textarea there, upgraded to RichTextEditor on the edit page.
function ContentField({
  name,
  label,
  sessionId,
  defaultValue,
  rows = 4,
}: {
  name: string;
  label: string;
  sessionId?: string;
  defaultValue: string;
  rows?: number;
}) {
  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label htmlFor={sessionId ? undefined : name}>{label}</Label>
      {sessionId ? (
        <RichTextEditor name={name} sessionId={sessionId} defaultValue={defaultValue} />
      ) : (
        <Textarea id={name} name={name} rows={rows} defaultValue={defaultValue} />
      )}
    </div>
  );
}

export function SessionForm({
  seriesId,
  session,
}: {
  seriesId: string;
  session?: Database["public"]["Tables"]["event_sessions"]["Row"];
}) {
  const action = session
    ? updateSession.bind(null, seriesId, session.id)
    : createSession.bind(null, seriesId);
  const [state, formAction] = useActionState(action, initialState);
  const [customColorEnabled, setCustomColorEnabled] = useState(!!session?.theme_color);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="name">場次名稱</Label>
        <Input id="name" name="name" required defaultValue={session?.name} placeholder="例：和美場-主辦搭設帳" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="location">地點</Label>
        <Input id="location" name="location" defaultValue={session?.location ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="managing_org">負責審核單位</Label>
        <Input id="managing_org" name="managing_org" defaultValue={session?.managing_org ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="date_start">活動開始日期</Label>
        <Input id="date_start" name="date_start" type="date" defaultValue={session?.date_start ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="date_end">活動結束日期</Label>
        <Input id="date_end" name="date_end" type="date" defaultValue={session?.date_end ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="capacity_total">開放報名上限（選填，額滿將自動關閉報名表單）</Label>
        <Input id="capacity_total" name="capacity_total" type="number" defaultValue={session?.capacity_total ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="admission_quota">實際錄取名額（選填，僅供儀表板/審核頁參考，不會自動限制錄取）</Label>
        <Input
          id="admission_quota"
          name="admission_quota"
          type="number"
          defaultValue={session?.admission_quota ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="max_members_per_registration">每筆報名人數上限</Label>
        <Input
          id="max_members_per_registration"
          name="max_members_per_registration"
          type="number"
          min={1}
          required
          defaultValue={session?.max_members_per_registration ?? 1}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="fee_base">基本費用（僅供參考顯示，不參與金額計算）</Label>
        <Input id="fee_base" name="fee_base" type="number" step="0.01" defaultValue={session?.fee_base ?? 0} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="fee_discount_per_person">
          每人報名費（審核完成後，繳費金額 = 需繳費人數 × 此金額，系統自動計算）
        </Label>
        <Input
          id="fee_discount_per_person"
          name="fee_discount_per_person"
          type="number"
          step="0.01"
          defaultValue={session?.fee_discount_per_person ?? 0}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="registration_open_at">開放報名時間</Label>
        <Input
          id="registration_open_at"
          name="registration_open_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(session?.registration_open_at ?? null)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="registration_close_at">報名截止時間</Label>
        <Input
          id="registration_close_at"
          name="registration_close_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(session?.registration_close_at ?? null)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="result_announce_at">結果公告時間</Label>
        <Input
          id="result_announce_at"
          name="result_announce_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(session?.result_announce_at ?? null)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cancel_deadline_at">取消退費期限</Label>
        <Input
          id="cancel_deadline_at"
          name="cancel_deadline_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(session?.cancel_deadline_at ?? null)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="status">狀態</Label>
        <select
          id="status"
          name="status"
          defaultValue={session?.status ?? "draft"}
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm"
        >
          <option value="draft">草稿</option>
          <option value="open">開放中</option>
          <option value="closed">已截止</option>
          <option value="archived">已封存</option>
        </select>
      </div>
      <ContentField
        name="consent_gate_text"
        label={`同意頁面文字（選填，留空使用系統預設；可用 {{活動名稱}} 代表系列+場次名稱，會自動代換）`}
        sessionId={session?.id}
        defaultValue={session?.consent_gate_text ?? ""}
        rows={5}
      />
      <ContentField
        name="intro_content"
        label="開頭介紹（選填，顯示在流程表上方）"
        sessionId={session?.id}
        defaultValue={session?.intro_content ?? ""}
        rows={3}
      />
      <ContentField
        name="schedule_content"
        label="流程表（選填，空白則報名表單不顯示此區塊）"
        sessionId={session?.id}
        defaultValue={session?.schedule_content ?? ""}
      />
      <ContentField
        name="registration_process_content"
        label="報名流程說明（選填）"
        sessionId={session?.id}
        defaultValue={session?.registration_process_content ?? ""}
      />
      <ContentField
        name="fee_waiver_content"
        label="減免內容及應附文件說明（選填）"
        sessionId={session?.id}
        defaultValue={session?.fee_waiver_content ?? ""}
      />
      <ContentField
        name="rules_text"
        label="活動辦法/注意事項全文（必填，民眾同意前會看到，送出前的同意條款也會引用此場次名稱）"
        sessionId={session?.id}
        defaultValue={session?.rules_text ?? ""}
        rows={5}
      />
      <ContentField
        name="privacy_consent_text"
        label="個人資料提供同意書全文（選填，留空使用系統預設文字）"
        sessionId={session?.id}
        defaultValue={session?.privacy_consent_text ?? ""}
        rows={5}
      />
      <ContentField
        name="submit_reminder_text"
        label="送出前提醒事項（選填，如公布時間、通知方式、取消異動期限與聯絡方式、退費規則、遞補作業說明）"
        sessionId={session?.id}
        defaultValue={session?.submit_reminder_text ?? ""}
        rows={6}
      />
      <ContentField
        name="success_message_text"
        label="送出成功後顯示文字（選填，留空使用系統預設文字）"
        sessionId={session?.id}
        defaultValue={session?.success_message_text ?? ""}
      />
      <div className="grid gap-2">
        <Label htmlFor="redirect_url">送出成功後導向按鈕網址（選填）</Label>
        <Input
          id="redirect_url"
          name="redirect_url"
          type="url"
          placeholder="https://..."
          defaultValue={session?.redirect_url ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="redirect_label">導向按鈕文字（選填，預設「前往活動官網」）</Label>
        <Input
          id="redirect_label"
          name="redirect_label"
          defaultValue={session?.redirect_label ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label>報名頁面背景顏色</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="custom-color-toggle"
            checked={customColorEnabled}
            onCheckedChange={(checked) => setCustomColorEnabled(checked === true)}
          />
          <Label htmlFor="custom-color-toggle" className="font-normal">
            自訂背景顏色（不勾選則使用系統預設）
          </Label>
          {customColorEnabled && (
            <input
              name="theme_color"
              type="color"
              defaultValue={session?.theme_color || "#ffffff"}
              className="h-8 w-14 rounded border p-0.5"
            />
          )}
        </div>
      </div>

      {state.error && <p className="text-destructive text-sm sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <SubmitButton>{session ? "儲存" : "建立場次"}</SubmitButton>
      </div>
    </form>
  );
}
