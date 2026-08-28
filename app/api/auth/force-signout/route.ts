import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Route Handlers are the only server context where cookies().set() actually reaches
// the browser (a Server Component's write is silently swallowed), so proxy.ts routes
// its 8-hour session-timebox expiry through here rather than clearing the sb-* auth
// cookies itself.
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const loginUrl = new URL("/admin/login", url.origin);
  loginUrl.searchParams.set("reason", url.searchParams.get("reason") ?? "expired");
  const redirectTo = url.searchParams.get("redirectTo");
  if (redirectTo) {
    loginUrl.searchParams.set("redirectTo", redirectTo);
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete("admin_login_at");
  return response;
}
