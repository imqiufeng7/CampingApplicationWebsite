import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSessionAccess, ForbiddenError } from "@/lib/auth/guards";

// Authorization runs against the caller's own authenticated session (via
// lib/supabase/server.ts, which is RLS-protected), exactly mirroring the
// registration/session access rules used everywhere else in the admin UI. Only after
// that check passes do we reach for the service-role client, and only to mint a
// short-lived signed URL for this one object — never to hand out broader access.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("registration_files")
    .select("id, storage_path, registration_id")
    .eq("id", fileId)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select("session_id")
    .eq("id", file.registration_id)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });
  }

  try {
    await requireSessionAccess(registration.session_id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("registration-files")
    .createSignedUrl(file.storage_path, 60);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "無法建立下載網址" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
