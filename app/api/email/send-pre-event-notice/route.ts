import { NextResponse } from "next/server";
import { requireAdmin, requireFieldEditable, requireSessionAccess, ForbiddenError } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailAdapter } from "@/lib/email";
import { composePreEventNotice } from "@/lib/email/composePreEventNotice";
import { formatTentNo, type PreEventNoticeInput } from "@/lib/email/templates/preEventNotice";
import { NOTICE_SAMPLE_TOKENS, noticeReplyUrl } from "@/lib/noticeReply";

// A full session is ~60–100 SMTP sends; the dialog also chunks its requests so no
// single call has to cover the whole batch.
export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 行前通知 batch send. Recipients are always re-filtered here to 正取 + not cancelled
// + payment settled (已完成 / 無需繳費), whatever the caller passes. Body:
//   { sessionId, registrationIds?, resend?, testTo?, testSelfPitch? }
// testTo sends ONE email to that address only (subject prefixed 【測試】, reply
// button pointing at the fictional sample page) and logs nothing.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  const registrationIds = Array.isArray(body?.registrationIds)
    ? (body.registrationIds as unknown[]).filter((id): id is string => typeof id === "string")
    : null;
  const resend = body?.resend === true;
  const testTo = typeof body?.testTo === "string" ? body.testTo.trim() : null;
  const testSelfPitch = body?.testSelfPitch === true;

  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }
  if (testTo !== null && !EMAIL_RE.test(testTo)) {
    return NextResponse.json({ error: "測試信收件信箱格式不正確" }, { status: 400 });
  }

  try {
    const currentAdmin = await requireAdmin();
    await requireFieldEditable(currentAdmin, "錄取分組結果");
    await requireSessionAccess(sessionId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const [{ data: session }, { data: categories }] = await Promise.all([
    admin
      .from("event_sessions")
      .select("name, location, date_start, date_end, theme_color, office_contact")
      .eq("id", sessionId)
      .maybeSingle(),
    admin.from("session_registration_categories").select("id, is_free").eq("session_id", sessionId),
  ]);
  if (!session?.date_start || !session.date_end) {
    return NextResponse.json({ error: "場次尚未設定活動日期" }, { status: 400 });
  }
  if (!session.location || !session.office_contact) {
    return NextResponse.json({ error: "場次尚未設定活動地點或公所聯絡資訊" }, { status: 400 });
  }
  const freeCategoryIds = new Set((categories ?? []).filter((c) => c.is_free).map((c) => c.id));

  let query = admin
    .from("registrations")
    .select(
      "id, contact_email, registration_category_id, group_zone, group_number, notice_token, sleeping_bag_own_qty, sleeping_bag_rent_qty, comfort_bed_needed"
    )
    .eq("session_id", sessionId)
    .eq("is_cancelled", false)
    .eq("admission_status", "正取")
    .in("payment_status", ["已完成", "無需繳費"])
    .order("registration_seq", { ascending: true });
  if (registrationIds) query = query.in("id", registrationIds);
  const { data: registrations } = await query;

  const eligible = registrations ?? [];
  const isSelfPitch = (r: { registration_category_id: string | null }) =>
    Boolean(r.registration_category_id && freeCategoryIds.has(r.registration_category_id));

  async function buildInput(
    r: (typeof eligible)[number],
    replyUrl: string
  ): Promise<PreEventNoticeInput> {
    const { data: members } = await admin
      .from("registration_members")
      .select("name")
      .eq("registration_id", r.id)
      .order("member_order", { ascending: true });
    return {
      selfPitch: isSelfPitch(r),
      leaderName: members?.[0]?.name ?? "",
      sessionName: session!.name,
      location: session!.location!,
      dateStart: session!.date_start!,
      dateEnd: session!.date_end!,
      tentNo: formatTentNo(r.group_zone, r.group_number),
      memberCount: members?.length ?? 0,
      sleepingBagOwn: r.sleeping_bag_own_qty,
      sleepingBagProvided: r.sleeping_bag_rent_qty,
      comfortBedRequested: r.comfort_bed_needed === "需要",
      officeContact: session!.office_contact!,
      replyUrl,
    };
  }

  const adapter = getEmailAdapter();

  if (testTo !== null) {
    // Real content from the first eligible registration of the requested kind, so the
    // test shows exactly what that group would receive — but the reply button goes to
    // the fictional sample page, never the real registration's link.
    const sample = eligible.find((r) => isSelfPitch(r) === testSelfPitch);
    if (!sample) {
      return NextResponse.json(
        { error: `此場次目前沒有符合寄送條件的${testSelfPitch ? "自搭帳" : "主辦搭設帳"}報名可作為測試內容` },
        { status: 400 }
      );
    }
    const token = testSelfPitch ? NOTICE_SAMPLE_TOKENS.selfPitch : NOTICE_SAMPLE_TOKENS.host;
    const { subject, html } = composePreEventNotice(
      await buildInput(sample, noticeReplyUrl(siteUrl, token)),
      session.theme_color
    );
    const result = await adapter.sendEmail({ to: testTo, subject: `【測試】${subject}`, body: html });
    if (result.status !== "sent") {
      return NextResponse.json({ error: `測試信寄送失敗：${result.errorMessage ?? ""}` }, { status: 502 });
    }
    return NextResponse.json({ total: 1, sent: 1, failed: 0, skipped: 0 });
  }

  let alreadySent = new Set<string>();
  if (!resend && eligible.length > 0) {
    const { data: logs } = await admin
      .from("email_logs")
      .select("registration_id")
      .eq("type", "行前通知")
      .eq("status", "sent")
      .in(
        "registration_id",
        eligible.map((r) => r.id)
      );
    alreadySent = new Set((logs ?? []).map((l) => l.registration_id));
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of eligible) {
    if (alreadySent.has(r.id)) {
      skipped += 1;
      continue;
    }
    const { subject, html } = composePreEventNotice(
      await buildInput(r, noticeReplyUrl(siteUrl, r.notice_token)),
      session.theme_color
    );
    const result = await adapter.sendEmail({ to: r.contact_email, subject, body: html });

    await admin.from("email_logs").insert({
      registration_id: r.id,
      type: "行前通知",
      status: result.status,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
      error_message: result.errorMessage ?? null,
      subject,
      body: html,
    });

    if (result.status === "sent") sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ total: eligible.length, sent, failed, skipped });
}
