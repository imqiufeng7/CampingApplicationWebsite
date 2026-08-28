import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Supabase's own session-timeout controls (auth.sessions.timebox /
// inactivity_timeout in supabase/config.toml) are gated behind the Pro plan — this
// project is on Free, so the 8h absolute cap is enforced here instead, tracked via a
// plain marker cookie (not the actual session credential) stamped at first-request-
// after-login. The 30-minute idle timeout is handled client-side by IdleTimeout.tsx,
// since "no request reaches the server" is exactly the case an idle admin sits in.
const ADMIN_LOGIN_AT_COOKIE = "admin_login_at";
const SESSION_TIMEBOX_MS = 8 * 60 * 60 * 1000;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /admin/login and /admin/accept-invite (the Supabase invite-email landing page,
  // where a session is still being established client-side from the URL's token) must
  // stay reachable without an existing session — everything else under /admin needs one.
  const isAdminRoute =
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/login") &&
    !request.nextUrl.pathname.startsWith("/admin/accept-invite");

  if (isAdminRoute && !user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && user) {
    const loginAtRaw = request.cookies.get(ADMIN_LOGIN_AT_COOKIE)?.value;
    const loginAt = loginAtRaw ? Number(loginAtRaw) : null;
    const now = Date.now();

    if (loginAt && now - loginAt > SESSION_TIMEBOX_MS) {
      // The marker cookie alone proves nothing about the real sb-* session — clearing
      // it here would just let the next request re-stamp "now" and slide the window
      // forever. The actual sign-out has to happen server-side too, which Next.js only
      // allows from a Route Handler (a Server Component's cookies().set() is silently
      // swallowed — see lib/supabase/server.ts), hence the redirect through one.
      const forceSignoutUrl = new URL("/api/auth/force-signout", request.url);
      forceSignoutUrl.searchParams.set("reason", "expired");
      forceSignoutUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(forceSignoutUrl);
    }

    if (!loginAt) {
      response.cookies.set(ADMIN_LOGIN_AT_COOKIE, String(now), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TIMEBOX_MS / 1000,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|s/|edit/).*)",
  ],
};
