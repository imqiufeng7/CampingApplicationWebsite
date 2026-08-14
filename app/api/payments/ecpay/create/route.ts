import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireFieldEditable, requireSessionAccess, ForbiddenError } from "@/lib/auth/guards";

// Manual "(re)generate payment link" trigger from the admin payment panel — the same
// link the automated send-results flow (app/api/email/send-results) would have set.
// Uses the caller's own authenticated client (not service-role) so RLS + the
// column-permission trigger apply normally to this write.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const registrationId = body?.registrationId as string | undefined;
  const sessionId = body?.sessionId as string | undefined;

  if (!registrationId || !sessionId) {
    return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
  }

  try {
    const currentAdmin = await requireAdmin();
    await requireFieldEditable(currentAdmin, "繳費狀態");
    await requireSessionAccess(sessionId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const ecpayLink = `${siteUrl}/api/payments/ecpay/checkout/${registrationId}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({ payment_method: "online", ecpay_link: ecpayLink })
    .eq("id", registrationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ecpayLink });
}
