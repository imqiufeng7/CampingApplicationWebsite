import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// Proxies the self-service delete-by-token RPC through a route (rather than calling
// it directly from the browser like fn_get_registration_for_edit/
// fn_update_registration_via_token are) for one reason: Storage cleanup. Postgres has
// no way to reach the Storage API itself, and removing the uploaded files requires the
// service-role key, so an app-layer step is unavoidable here — see
// lib/deleteRegistrationFiles.ts.
//
// The eligibility gate itself (payment not yet 已完成, admission still 待確認) still
// lives entirely in fn_delete_registration_via_token — this route does not duplicate
// it, only wraps it.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token as string | undefined;

  if (!token) {
    return NextResponse.json({ error: "缺少參數" }, { status: 400 });
  }

  // Forwarded explicitly so fn_client_ip() inside the RPC call below sees the real
  // visitor's IP rather than this server's own outbound address — otherwise every
  // self-service delete would share one rate-limit bucket and audit-log IP.
  const clientIp = request.headers.get("x-forwarded-for") ?? "";

  const admin = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: clientIp ? { "x-forwarded-for": clientIp } : {} },
    }
  );

  const { data: registration } = await admin
    .from("registrations")
    .select("id")
    .eq("edit_token", token)
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });
  }

  // Fetched *before* the RPC, not deleted yet — the RPC's own eligibility check might
  // still reject this delete, and only reads registration_files (never removes the
  // actual Storage blobs), so nothing is destroyed until the DB deletion has actually
  // succeeded.
  const { data: files } = await admin
    .from("registration_files")
    .select("storage_path")
    .eq("registration_id", registration.id);
  const paths = (files ?? []).map((f) => f.storage_path).filter((p): p is string => Boolean(p));

  const { error: rpcError } = await admin.rpc("fn_delete_registration_via_token", { p_token: token });
  if (rpcError) {
    const friendly = rpcError.message.includes("no longer be self-deleted")
      ? "此筆報名已無法自助刪除，請洽詢主辦單位。"
      : rpcError.message.includes("too many requests")
        ? "操作過於頻繁，請稍後再試。"
        : "刪除失敗，請稍後再試。";
    return NextResponse.json({ error: friendly }, { status: 400 });
  }

  // The DB row (and its registration_files rows) is gone now — this is the only
  // remaining reference to what to remove from Storage. Best-effort: a partial
  // failure here doesn't change the outcome the caller sees, the data-access-gating
  // deletion already succeeded.
  if (paths.length > 0) {
    await admin.storage.from("registration-files").remove(paths);
  }

  return NextResponse.json({ ok: true });
}
