import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionForm } from "@/components/admin/SessionForm";
import { IdentityTypeEditor } from "@/components/admin/IdentityTypeEditor";
import { FeeCategoryEditor } from "@/components/admin/FeeCategoryEditor";
import { BannerUploadField } from "@/components/admin/BannerUploadField";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";

export default async function SessionBuilderPage({
  params,
}: {
  params: Promise<{ seriesId: string; sessionId: string }>;
}) {
  await requireRole("vendor");
  const { seriesId, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: session }, { data: identityTypes }, { data: feeCategories }] = await Promise.all([
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
  ]);

  if (!session) {
    notFound();
  }

  const publicUrl =
    session.status === "open" ? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${sessionId}` : null;

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
    </div>
  );
}
