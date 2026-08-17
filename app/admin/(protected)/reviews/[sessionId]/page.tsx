import { createClient } from "@/lib/supabase/server";
import { requireSessionAccess } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { SendResultsDialog } from "@/components/admin/SendResultsDialog";
import { sortRegistrationsForReview } from "@/lib/reviewSort";
import { ReviewTable, type ReviewRow } from "@/components/admin/reviews/ReviewTable";

export default async function ReviewListPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const admin = await requireSessionAccess(sessionId);
  const supabase = await createClient();

  const [{ data: session }, { data: identityTypes }, { data: feeCategories }, { data: registrationCategories }] =
    await Promise.all([
      supabase.from("event_sessions").select("name").eq("id", sessionId).maybeSingle(),
      supabase.from("session_identity_types").select("id, name").eq("session_id", sessionId),
      supabase.from("session_fee_categories").select("id, label, code").eq("session_id", sessionId),
      supabase.from("session_registration_categories").select("id, label").eq("session_id", sessionId),
    ]);

  const { data: registrations } = await supabase
    .from("registrations")
    .select(
      "id, registration_seq, submitted_at, contact_email, contact_phone, review_status, admission_status, waitlist_rank, group_zone, group_number, sleeping_bag_own_qty, sleeping_bag_rent_qty, payment_status, payment_amount, admin_note, is_cancelled, cancel_reason, resubmission_reason, duplicate_flag, registration_category_id"
    )
    .eq("session_id", sessionId);

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const [{ data: members }, { data: files }] = await Promise.all([
    registrationIds.length
      ? supabase
          .from("registration_members")
          .select(
            "id, registration_id, member_order, name, identity_type_id, org_selected, org_other_text, fee_category_id, fee_review_result, birth_year_roc, birth_month, birth_day"
          )
          .in("registration_id", registrationIds)
          .order("member_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    registrationIds.length
      ? supabase
          .from("registration_files")
          .select("id, member_id, file_type, registration_id")
          .in("registration_id", registrationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const membersByRegistration = new Map<string, typeof members>();
  for (const m of members ?? []) {
    const list = membersByRegistration.get(m.registration_id) ?? [];
    list.push(m);
    membersByRegistration.set(m.registration_id, list);
  }

  const filesByRegistration = new Map<string, { id: string; member_id: string | null; file_type: string }[]>();
  for (const f of files ?? []) {
    const list = filesByRegistration.get(f.registration_id) ?? [];
    list.push({ id: f.id, member_id: f.member_id, file_type: f.file_type });
    filesByRegistration.set(f.registration_id, list);
  }

  const memberCountById = new Map(
    [...membersByRegistration.entries()].map(([id, list]) => [id, (list ?? []).length])
  );
  const sorted = sortRegistrationsForReview(registrations ?? [], memberCountById);

  const eligible = sorted.filter((r) => !r.is_cancelled && r.review_status === "審核通過");
  const admittedCount = eligible.filter((r) => r.admission_status === "正取").length;
  const waitlistCount = eligible.filter((r) => r.admission_status === "備取").length;

  const identityTypeMap = new Map((identityTypes ?? []).map((it) => [it.id, it.name]));
  const feeCategoryMap = new Map(
    (feeCategories ?? []).map((fc) => [fc.id, fc.code ? `${fc.code} ${fc.label}` : fc.label])
  );
  const registrationCategoryMap = new Map(
    (registrationCategories ?? []).map((rc) => [rc.id, rc.label])
  );

  const rows: ReviewRow[] = sorted.map((r) => ({
    ...r,
    memberNames: (membersByRegistration.get(r.id) ?? []).map((m) => m.name),
    members: membersByRegistration.get(r.id) ?? [],
    files: filesByRegistration.get(r.id) ?? [],
  }));

  const canSendResults = admin.fieldPermissions["錄取分組結果"] === "editable";

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{session?.name} — 審核列表</h1>
        {canSendResults && (
          <SendResultsDialog
            sessionId={sessionId}
            admittedCount={admittedCount}
            waitlistCount={waitlistCount}
          />
        )}
      </div>
      <Card>
        <CardContent>
          <ReviewTable
            sessionId={sessionId}
            data={rows}
            identityTypeMap={identityTypeMap}
            feeCategoryMap={feeCategoryMap}
            registrationCategoryMap={registrationCategoryMap}
            fieldPermissions={admin.fieldPermissions}
            initialSortIds={sorted.map((r) => r.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
