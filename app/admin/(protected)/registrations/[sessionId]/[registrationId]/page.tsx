import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSessionAccess } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReviewPanel } from "@/components/admin/ReviewPanel";
import { PaymentPanel } from "@/components/admin/PaymentPanel";
import { MemberReviewRow } from "@/components/admin/MemberReviewRow";
import { formatRegistrationNo } from "@/lib/registrationNo";
import { sortRegistrationsForReview } from "@/lib/reviewSort";

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string; registrationId: string }>;
}) {
  const { sessionId, registrationId } = await params;
  const admin = await requireSessionAccess(sessionId);
  const supabase = await createClient();

  const { data: registration } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) {
    notFound();
  }

  const [
    { data: members },
    { data: identityTypes },
    { data: feeCategories },
    { data: files },
    { data: emailLogs },
    { data: sessionRegistrations },
  ] = await Promise.all([
    supabase
      .from("registration_members")
      .select("*")
      .eq("registration_id", registrationId)
      .order("member_order", { ascending: true }),
    supabase.from("session_identity_types").select("id, name").eq("session_id", sessionId),
    supabase
      .from("session_fee_categories")
      .select("id, label, code")
      .eq("session_id", sessionId),
    supabase
      .from("registration_files")
      .select("id, member_id, file_type")
      .eq("registration_id", registrationId),
    supabase
      .from("email_logs")
      .select("*")
      .eq("registration_id", registrationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("registrations")
      .select("id, submitted_at, sleeping_bag_own_qty")
      .eq("session_id", sessionId),
  ]);

  const idNumbers = await Promise.all(
    (members ?? []).map((m) =>
      supabase.rpc("fn_get_registration_member_id_number", { p_member_id: m.id })
    )
  );

  // Prev/next follows the exact same order as the review list, so "next" here always
  // matches what's actually next in the list the reviewer is working through.
  const { data: allSessionMembers } = await supabase
    .from("registration_members")
    .select("registration_id")
    .in("registration_id", (sessionRegistrations ?? []).map((r) => r.id));
  const memberCountById = new Map<string, number>();
  for (const m of allSessionMembers ?? []) {
    memberCountById.set(m.registration_id, (memberCountById.get(m.registration_id) ?? 0) + 1);
  }
  const sortedIds = sortRegistrationsForReview(sessionRegistrations ?? [], memberCountById).map(
    (r) => r.id
  );
  const currentIndex = sortedIds.indexOf(registrationId);
  const prevId = currentIndex > 0 ? sortedIds[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 && currentIndex < sortedIds.length - 1 ? sortedIds[currentIndex + 1] : null;

  const identityTypeMap = new Map((identityTypes ?? []).map((it) => [it.id, it.name]));
  const feeCategoryMap = new Map(
    (feeCategories ?? []).map((fc) => [fc.id, fc.code ? `${fc.code} ${fc.label}` : fc.label])
  );

  // This legacy single-fieldset form submits all its fields in one bulk update, so it
  // only offers editing when every field group it touches is editable — otherwise a
  // submission could silently drop a change the DB trigger rejects for one field while
  // accepting the rest. The per-field-group inline table (reviews list) doesn't have
  // this limitation.
  const canEditReview =
    admin.fieldPermissions["錄取分組結果"] === "editable" &&
    admin.fieldPermissions["取消退費資訊"] === "editable" &&
    admin.fieldPermissions["備註"] === "editable";
  const canEditPayment = admin.fieldPermissions["繳費狀態"] === "editable";
  const canEditFeeReview = admin.fieldPermissions["免付費審核結果"] === "editable";

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">
            報名詳情 <span className="font-mono">{formatRegistrationNo(registration.registration_seq)}</span>
            {currentIndex >= 0 && (
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                第 {currentIndex + 1} / {sortedIds.length} 筆
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">
            {registration.contact_email} · {registration.contact_phone}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {prevId ? (
            <Link href={`/admin/registrations/${sessionId}/${prevId}`}>
              <Button type="button" variant="outline" size="sm">
                ← 上一筆
              </Button>
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              ← 上一筆
            </Button>
          )}
          {nextId ? (
            <Link href={`/admin/registrations/${sessionId}/${nextId}`}>
              <Button type="button" variant="outline" size="sm">
                下一筆 →
              </Button>
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              下一筆 →
            </Button>
          )}
          <Link href={`/admin/reviews/${sessionId}`} className="text-muted-foreground underline">
            返回審核列表
          </Link>
          <Link href={`/admin/payments/${sessionId}`} className="text-muted-foreground underline">
            返回繳費列表
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>成員資料（共 {members?.length ?? 0} 人）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名/身分證字號</TableHead>
                <TableHead>身分別/單位</TableHead>
                <TableHead>申請類別</TableHead>
                <TableHead>審核結果</TableHead>
                <TableHead>證明文件</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).map((m, i) => (
                <MemberReviewRow
                  key={m.id}
                  sessionId={sessionId}
                  registrationId={registrationId}
                  canEdit={canEditFeeReview}
                  member={m}
                  idNumber={(idNumbers[i]?.data as string | null) ?? null}
                  identityTypeName={m.identity_type_id ? identityTypeMap.get(m.identity_type_id) ?? null : null}
                  feeCategoryLabel={m.fee_category_id ? feeCategoryMap.get(m.fee_category_id) ?? null : null}
                  files={(files ?? []).filter((f) => f.member_id === m.id)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>審核 / 錄取 / 分組 / 取消{!canEditReview && "（唯讀）"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReviewPanel
            sessionId={sessionId}
            registrationId={registrationId}
            registration={registration}
            editable={canEditReview}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>繳費資訊{!canEditPayment && "（唯讀）"}</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentPanel
            sessionId={sessionId}
            registrationId={registrationId}
            registration={registration}
            editable={canEditPayment}
          />
        </CardContent>
      </Card>

      {(emailLogs ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>通知寄送紀錄</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(emailLogs ?? []).map((log) => (
              <details key={log.id} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  {new Date(log.created_at).toLocaleString("zh-TW")} · {log.type} ·{" "}
                  <span className={log.status === "sent" ? "text-foreground" : "text-destructive"}>
                    {log.status === "sent" ? "已寄送" : log.status === "failed" ? "寄送失敗" : "處理中"}
                  </span>
                </summary>
                <div className="mt-2 grid gap-1 text-sm">
                  {log.subject && <p className="font-medium">主旨：{log.subject}</p>}
                  {log.body && <p className="whitespace-pre-wrap">{log.body}</p>}
                  {log.error_message && <p className="text-destructive">錯誤：{log.error_message}</p>}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
