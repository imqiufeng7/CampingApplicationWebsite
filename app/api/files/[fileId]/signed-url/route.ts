import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSessionAccess, ForbiddenError } from "@/lib/auth/guards";

// Same "first entry in x-forwarded-for" logic as fn_client_ip() in
// 20260820120001_pdpa_hardening.sql, reimplemented here since this insert happens
// directly from app code rather than through a SQL RPC that could call that function.
function clientIp(request: Request): string | null {
  const raw = request.headers.get("x-forwarded-for");
  if (!raw) return null;
  return raw.split(",")[0]?.trim() || null;
}

// Authorization runs against the caller's own authenticated session (via
// lib/supabase/server.ts, which is RLS-protected), exactly mirroring the
// registration/session access rules used everywhere else in the admin UI. Only after
// that check passes do we reach for the service-role client, and only to mint a
// short-lived signed URL for this one object — never to hand out broader access.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("registration_files")
    .select("id, storage_path, registration_id, file_type, member_id")
    .eq("id", fileId)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select("session_id, registration_seq")
    .eq("id", file.registration_id)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });
  }

  let admin;
  try {
    admin = await requireSessionAccess(registration.session_id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from("registration-files")
    .createSignedUrl(file.storage_path, 60);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "無法建立下載網址" }, { status: 500 });
  }

  // Same PDPA audit trail as viewing a decrypted ID number (see
  // fn_get_registration_member_id_number) — logged after the signed URL is minted so a
  // failure here never blocks the actual download, since the file access has already
  // been authorized at that point regardless.
  let memberName: string | null = null;
  if (file.member_id) {
    const { data: member } = await adminClient
      .from("registration_members")
      .select("name")
      .eq("id", file.member_id)
      .maybeSingle();
    memberName = member?.name ?? null;
  }
  await adminClient.from("admin_activity_log").insert({
    session_id: registration.session_id,
    registration_id: file.registration_id,
    registration_seq: registration.registration_seq,
    admin_user_id: admin.id,
    admin_email: admin.email,
    summary: memberName
      ? `報名 #${registration.registration_seq}：查看成員「${memberName}」的證明文件（${file.file_type}）`
      : `報名 #${registration.registration_seq}：查看證明文件（${file.file_type}）`,
    ip_address: clientIp(request),
    log_type: "view",
  });

  return NextResponse.json({ url: data.signedUrl });
}
