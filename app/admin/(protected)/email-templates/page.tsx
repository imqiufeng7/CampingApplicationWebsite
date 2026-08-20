import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import type { EmailType } from "@/lib/db/types";

const TYPE_LABELS: Record<EmailType, string> = {
  報名確認: "報名確認信（送出報名後立即寄出，含修改連結）",
  審核結果: "審核結果/繳費通知（舊版，不再使用）",
  "審核結果-正取": "錄取通知/繳費通知（正取，後台批次寄送）",
  "審核結果-備取": "備取通知（備取，後台批次寄送）",
  退回補件: "需補件通知（審核設為「退回補件」時寄出）",
  付款通知: "付款通知",
  場次資訊: "場次資訊",
  報到QR: "報到 QR",
  遞補通知: "遞補通知",
  管理員邀請: "管理員邀請信（新增管理員帳號或重寄邀請時寄出）",
};

const PLACEHOLDERS: Partial<Record<EmailType, string[]>> = {
  報名確認: ["活動名稱", "報名編號", "聯絡Email", "聯絡電話", "第一位成員姓名", "成員名單", "修改連結"],
  "審核結果-正取": ["活動名稱", "活動日期", "第一位成員姓名", "錄取結果", "成員審核結果", "繳費資訊"],
  "審核結果-備取": ["活動名稱", "活動日期", "第一位成員姓名", "錄取結果", "成員審核結果", "繳費資訊"],
  退回補件: ["活動名稱", "報名編號", "補件原因", "修改連結"],
  管理員邀請: ["姓名", "角色", "設定連結"],
};

// Sample data so the vendor can preview layout without needing a real registration —
// same placeholder names the real send routes fill in, just with made-up example text.
const SAMPLE_VARS: Partial<Record<EmailType, Record<string, string>>> = {
  報名確認: {
    活動名稱: "2026年防災教育營",
    報名編號: "R000123",
    聯絡Email: "example@mail.com",
    聯絡電話: "0912-345-678",
    第一位成員姓名: "王小明",
    成員名單: "1. 王小明\n2. 陳小華",
    修改連結: "https://example.com/edit/abc123",
  },
  "審核結果-正取": {
    活動名稱: "2026年防災教育營",
    活動日期: "11月15日(星期六)至11月16日(星期日)",
    第一位成員姓名: "王小明",
    錄取結果: "您已錄取本次活動（正取）。",
    成員審核結果: "王小明：一般報名\n陳小華，符合低收入戶申請資格，無需繳交報名費",
    繳費資訊: "應繳金額：300 元\n請於期限內完成線上繳費：https://example.com/pay/abc123",
  },
  "審核結果-備取": {
    活動名稱: "2026年防災教育營",
    活動日期: "11月15日(星期六)至11月16日(星期日)",
    第一位成員姓名: "王小明",
    錄取結果: "您目前為備取名單，備取順位第 2 位，若有名額釋出將另行通知。",
    成員審核結果: "王小明：一般報名\n陳小華，符合低收入戶申請資格，無需繳交報名費",
    繳費資訊: "目前為備取名單，暫不需要繳費。如遞補錄取，將另行通知繳費方式與期限。",
  },
  退回補件: {
    活動名稱: "2026年防災教育營",
    報名編號: "R000123",
    補件原因: "王小明的證件照片模糊，請重新上傳清晰版本",
    修改連結: "https://example.com/edit/abc123",
  },
  管理員邀請: {
    姓名: "王小明",
    角色: "場地管理員",
    設定連結: "https://example.com/admin/accept-invite?token_hash=abc123&type=invite",
  },
};

// Only these types have send-triggering code today (see the email_templates
// migration's comment) — the other EmailType values are reachable in email_logs but
// have nothing yet that would use a template for them. 審核結果 (the old single
// template both statuses used to share) is intentionally excluded — 審核結果-正取/
// -備取 replaced it (see 20260820110001_split_review_result_templates.sql). 管理員邀請
// isn't logged to email_logs at all (see 20260820150001_admin_invite_email_template.sql)
// since it has no registration_id to attach a log row to.
const EDITABLE_TYPES: EmailType[] = [
  "報名確認",
  "審核結果-正取",
  "審核結果-備取",
  "退回補件",
  "管理員邀請",
];

export default async function EmailTemplatesPage() {
  await requireRole("vendor");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("email_templates")
    .select("type, subject_template, body_template")
    .in("type", EDITABLE_TYPES);
  const byType = new Map((templates ?? []).map((t) => [t.type, t]));

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-lg font-semibold">Email 範本</h1>
        <p className="text-muted-foreground text-sm">
          這裡設定的是全站預設內容；個別場次可在場次設定頁另外覆蓋。
        </p>
      </div>

      {EDITABLE_TYPES.map((type) => {
        const template = byType.get(type);
        if (!template) return null;
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-base">{TYPE_LABELS[type]}</CardTitle>
            </CardHeader>
            <CardContent>
              <EmailTemplateEditor
                type={type}
                subjectTemplate={template.subject_template}
                bodyTemplate={template.body_template}
                placeholders={PLACEHOLDERS[type] ?? []}
                sampleVars={SAMPLE_VARS[type] ?? {}}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
