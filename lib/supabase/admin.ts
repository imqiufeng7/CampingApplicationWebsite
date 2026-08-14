import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

// Service-role client. Bypasses RLS entirely — reserved for the narrow set of flows
// that legitimately have no logged-in admin session: the ECPay webhook, the email
// batch send job, and signed URL issuance for Storage. Never import this from a
// Server Action or Route Handler that's acting on behalf of a logged-in admin; use
// lib/supabase/server.ts for those so RLS + the column-permission triggers apply.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
