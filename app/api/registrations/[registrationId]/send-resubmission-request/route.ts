import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireAdmin,
  requireFieldEditable,
  requireSessionAccess,
  ForbiddenError,
} from "@/lib/auth/guards";
import { sendResubmissionRequestEmail } from "@/lib/email/sendResubmissionRequest";

// Admin-triggered (unlike send-confirmation, which the registrant's own success page
// calls) — requires an authenticated admin with edit access to 錄取分組結果 on this
// registration's session, mirroring the same check the review-table cell that calls
// this route already gates its "更新並寄送通知" button behind.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  const { registrationId } = await params;
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  try {
    const admin = await requireAdmin();
    await requireFieldEditable(admin, "錄取分組結果");
    await requireSessionAccess(sessionId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const adminClient = createAdminClient();
  const result = await sendResubmissionRequestEmail(adminClient, registrationId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "寄送失敗" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
