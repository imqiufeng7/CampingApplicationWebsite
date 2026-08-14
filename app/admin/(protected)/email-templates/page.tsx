import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";
import type { EmailType } from "@/lib/db/types";

const TYPE_LABELS: Record<EmailType, string> = {
  報名確認: "報名確認信（送出報名後立即寄出，含修改連結）",
  審核結果: "審核結果/繳費通知（後台批次寄送）",
  付款通知: "付款通知",
  場次資訊: "場次資訊",
  報到QR: "報到 QR",
  遞補通知: "遞補通知",
};

const PLACEHOLDERS: Partial<Record<EmailType, string[]>> = {
  報名確認: ["活動名稱", "報名編號", "聯絡Email", "聯絡電話", "成員名單", "修改連結"],
  審核結果: ["活動名稱", "錄取結果", "成員審核結果", "繳費資訊"],
};

// Only these two types have send-triggering code today (see the email_templates
// migration's comment) — the other EmailType values are reachable in email_logs but
// have nothing yet that would use a template for them.
const EDITABLE_TYPES: EmailType[] = ["報名確認", "審核結果"];

export default async function EmailTemplatesPage() {
  await requireRole("vendor");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("email_templates")
    .select("type, subject_template, body_template")
    .in("type", EDITABLE_TYPES);
  const byType = new Map((templates ?? []).map((t) => [t.type, t]));

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
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
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
