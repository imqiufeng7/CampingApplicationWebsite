import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Route Handlers are the only server context where cookies().set() actually reaches
// the browser (a Server Component's write is silently swallowed), so every sign-out
// path — the manual button, the 30-minute idle timeout, and proxy.ts's 8-hour
// timebox — routes through here rather than clearing cookies itself. That's not
// optional: admin_login_at is httpOnly, so client-side code has no way to clear it at
// all, and a stale copy left behind by a client-only signOut() would make the *next*
// login look already-expired on its very first request (proxy.ts has no way to tell
// "old cookie, fresh session" apart from "old cookie, old session").
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const loginUrl = new URL("/admin/login", url.origin);
  const reason = url.searchParams.get("reason");
  if (reason) {
    loginUrl.searchParams.set("reason", reason);
  }
  const redirectTo = url.searchParams.get("redirectTo");
  if (redirectTo) {
    loginUrl.searchParams.set("redirectTo", redirectTo);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete("admin_login_at");
  return response;
}
