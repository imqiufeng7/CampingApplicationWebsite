import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionForm } from "@/components/admin/SessionForm";
import { IdentityTypeEditor } from "@/components/admin/IdentityTypeEditor";
import { FeeCategoryEditor } from "@/components/admin/FeeCategoryEditor";
import { RegistrationCategoryEditor } from "@/components/admin/RegistrationCategoryEditor";
import { SessionEmailTemplateEditor } from "@/components/admin/SessionEmailTemplateEditor";
import { BannerUploadField } from "@/components/admin/BannerUploadField";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { PurgeRegistrationsButton } from "@/components/admin/PurgeRegistrationsButton";
import type { EmailType } from "@/lib/db/types";

const EMAIL_TEMPLATE_META: { type: EmailType; label: string; placeholders: string[] }[] = [
  {
    type: "報名確認",
    label: "報名確認信（送出報名後立即寄出）",
    placeholders: ["活動名稱", "報名編號", "聯絡Email", "聯絡電話", "第一位成員姓名", "成員名單", "修改連結"],
  },
  {
    type: "審核結果-正取",
    label: "錄取通知/繳費通知（正取，後台批次寄送）",
    placeholders: ["活動名稱", "活動日期", "第一位成員姓名", "錄取結果", "成員審核結果", "繳費資訊"],
  },
  {
    type: "審核結果-備取",
    label: "備取通知（備取，後台批次寄送）",
    placeholders: ["活動名稱", "活動日期", "第一位成員姓名", "錄取結果", "成員審核結果", "繳費資訊"],
  },
  {
    type: "退回補件",
    label: "需補件通知（審核設為「退回補件」時寄出）",
    placeholders: ["活動名稱", "報名編號", "補件原因", "修改連結"],
  },
];

export default async function SessionBuilderPage({
  params,
}: {
  params: Promise<{ seriesId: string; sessionId: string }>;
}) {
  await requireRole("vendor");
  const { seriesId, sessionId } = await params;
  const supabase = await createClient();

  const [
    { data: session },
    { data: identityTypes },
    { data: feeCategories },
    { data: registrationCategories },
    { data: emailTemplateOverrides },
    { data: globalEmailTemplates },
    { count: registrationCount },
  ] = await Promise.all([
    supabase.from("event_sessions").select("*").eq("id", sessionId).maybeSingle(),
    supabase
      .from("session_identity_types")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("session_fee_categories")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("session_registration_categories")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("session_email_templates")
      .select("type, subject_template, body_template")
      .eq("session_id", sessionId),
    supabase.from("email_templates").select("type, subject_template, body_template"),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
  ]);
  const emailOverrideByType = new Map(
    (emailTemplateOverrides ?? []).map((t) => [t.type, t])
  );
  const globalEmailTemplateByType = new Map((globalEmailTemplates ?? []).map((t) => [t.type, t]));

  if (!session) {
    notFound();
  }

  const publicUrl =
    session.status === "open" ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/r/${session.short_code}` : null;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Link href={`/admin/series/${seriesId}`} className="text-muted-foreground text-sm">
        ← 返回系列
      </Link>

      {publicUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">公開報名網址</CardTitle>
          </CardHeader>
          <CardContent>
            <CopyLinkButton url={publicUrl} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>場次設定</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <BannerUploadField
            seriesId={seriesId}
            sessionId={sessionId}
            bannerImagePath={session.banner_image_path}
          />
          <SessionForm seriesId={seriesId} session={session} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>報名類別設定</CardTitle>
        </CardHeader>
        <CardContent>
          <RegistrationCategoryEditor
            seriesId={seriesId}
            sessionId={sessionId}
            registrationCategories={registrationCategories ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>身分別設定</CardTitle>
        </CardHeader>
        <CardContent>
          <IdentityTypeEditor
            seriesId={seriesId}
            sessionId={sessionId}
            identityTypes={identityTypes ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>免付費/減免類別設定</CardTitle>
        </CardHeader>
        <CardContent>
          <FeeCategoryEditor
            seriesId={seriesId}
            sessionId={sessionId}
            feeCategories={feeCategories ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email 範本（此場次）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {EMAIL_TEMPLATE_META.map((meta) => {
            const globalDefault = globalEmailTemplateByType.get(meta.type);
            if (!globalDefault) return null;
            return (
              <SessionEmailTemplateEditor
                key={meta.type}
                seriesId={seriesId}
                sessionId={sessionId}
                type={meta.type}
                label={meta.label}
                placeholders={meta.placeholders}
                override={emailOverrideByType.get(meta.type) ?? null}
                globalDefault={globalDefault}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive text-base">危險區域：刪除報名資料</CardTitle>
        </CardHeader>
        <CardContent>
          <PurgeRegistrationsButton
            seriesId={seriesId}
            sessionId={sessionId}
            registrationCount={registrationCount ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
