import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Short-link redirect for the public registration page — see event_sessions.short_code
// in 20260821100001_session_short_code.sql for why this exists. Doesn't check
// session.status itself; /s/[sessionId] already renders its own "not open" message,
// so there's no reason to duplicate that logic here.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("event_sessions")
    .select("id")
    .eq("short_code", code)
    .maybeSingle();

  if (!session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.redirect(new URL(`/s/${session.id}`, request.url));
}
