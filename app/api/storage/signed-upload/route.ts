import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_FILE_SIZE_BYTES } from "@/lib/uploadConstants";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Supabase Storage rejects object keys containing non-ASCII characters outright (a
// hard "Invalid key" 400, not an encoding issue), so a Chinese file-type label like
// "身分證" can never be part of the path — only a plain ASCII slug is safe here. The
// human-readable label is preserved separately in registration_files.file_type (a
// normal Postgres text column, no character restrictions), which the client already
// sends alongside storage_path when submitting, so nothing is lost by keeping the
// path itself uninformative.
function asciiSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "doc";
}

// Public, unauthenticated route (the registration form itself has no login). Only
// mints a single-use, path-scoped signed upload URL — it never grants broader Storage
// access, so no anon RLS policy on storage.objects is needed at all (see
// supabase/migrations/*_storage_setup.sql).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId as string | undefined;
  const fileType = body?.fileType as string | undefined;
  const contentType = body?.contentType as string | undefined;
  const fileSize = body?.fileSize as number | undefined;

  if (!sessionId || !fileType || !contentType) {
    return NextResponse.json({ error: "缺少必要參數" }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "不支援的檔案格式" }, { status: 400 });
  }

  if (typeof fileSize === "number" && fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "檔案大小超過 5MB 限制" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: session } = await admin
    .from("event_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "open") {
    return NextResponse.json({ error: "此場次目前無法上傳檔案" }, { status: 400 });
  }

  const extension = EXTENSION_BY_TYPE[contentType] ?? "bin";
  const path = `${sessionId}/${randomUUID()}/${asciiSlug(fileType)}-${randomUUID()}.${extension}`;

  const { data, error } = await admin.storage
    .from("registration-files")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "無法建立上傳網址" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
