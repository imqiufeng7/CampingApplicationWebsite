"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/guards";

export type TourPage = "dashboard" | "reviews" | "payments";

// Uses the caller's own authenticated client (not service-role) — mark_admin_tour_seen
// is a narrow RPC that only ever touches the caller's own row's tour-seen columns
// (see supabase/migrations/20260820140001_admin_onboarding_tour.sql), so there's no
// broader admin_users write policy needed for this.
export async function markTourSeen(page: TourPage): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("mark_admin_tour_seen", { p_page: page });
}
