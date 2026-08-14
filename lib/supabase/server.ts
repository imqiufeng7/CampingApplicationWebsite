import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

// Cookie-bound client for Server Components / Route Handlers / Server Actions. Writes
// issued through this client carry the caller's own auth session, so RLS row-scoping
// and the column-permission triggers apply exactly as they would to any other
// authenticated request — this is the client admin mutations should use, NOT
// lib/supabase/admin.ts, so the database stays the single source of truth for
// permissions instead of trusting the server code to have checked correctly.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no response to attach cookies to.
            // Safe to ignore as long as middleware.ts is also refreshing the session.
          }
        },
      },
    }
  );
}
