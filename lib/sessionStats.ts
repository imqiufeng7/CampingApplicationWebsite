import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";

// Derived from status + dates rather than the raw draft/open/closed/archived enum —
// what an admin actually wants to know at a glance is whether people can still
// register, whether the event itself is happening right now, or whether it's over.
export function deriveStatusLabel(
  status: string,
  dateStart: string | null,
  dateEnd: string | null
): { label: string; variant: "default" | "secondary" } {
  if (status === "draft") return { label: "草稿", variant: "secondary" };
  if (status === "open") return { label: "報名中", variant: "default" };
  const now = Date.now();
  if (dateEnd && now > new Date(dateEnd).getTime()) return { label: "已完成", variant: "secondary" };
  if (dateStart && now >= new Date(dateStart).getTime()) return { label: "進行中", variant: "default" };
  return { label: "已截止報名", variant: "secondary" };
}

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "尚未設定活動時間";
  // Missing timeZone was a real bug, not just a 12/24-hour formatting nit — without
  // it this falls back to the server process's own local time (UTC on Vercel), which
  // would silently show every session's date range 8 hours off from Taipei time.
  const fmt = (s: string) =>
    new Date(s).toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: TAIPEI_TIME_ZONE,
    });
  return end ? `${fmt(start)} - ${fmt(end)}` : fmt(start);
}

export type SessionRegistrationStats = {
  registeredGroups: number;
  admittedGroups: number;
  registeredPeople: number;
  admittedPeople: number;
};

// 錄取組數/報名組數、錄取人數/報名人數 for every session in sessionIds, keyed by
// session id. Excludes cancelled registrations from both sides of each ratio.
export async function computeSessionStats(
  supabase: SupabaseClient<Database>,
  sessionIds: string[]
): Promise<Map<string, SessionRegistrationStats>> {
  const statsBySession = new Map<string, SessionRegistrationStats>();
  if (sessionIds.length === 0) return statsBySession;

  const { data: registrations } = await supabase
    .from("registrations")
    .select("id, session_id, admission_status, is_cancelled")
    .in("session_id", sessionIds);

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const { data: members } = registrationIds.length
    ? await supabase.from("registration_members").select("registration_id").in("registration_id", registrationIds)
    : { data: [] };
  const memberCountByRegistration = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByRegistration.set(m.registration_id, (memberCountByRegistration.get(m.registration_id) ?? 0) + 1);
  }

  for (const r of registrations ?? []) {
    if (r.is_cancelled) continue;
    const stat = statsBySession.get(r.session_id) ?? {
      registeredGroups: 0,
      admittedGroups: 0,
      registeredPeople: 0,
      admittedPeople: 0,
    };
    const peopleCount = memberCountByRegistration.get(r.id) ?? 0;
    stat.registeredGroups += 1;
    stat.registeredPeople += peopleCount;
    if (r.admission_status === "正取") {
      stat.admittedGroups += 1;
      stat.admittedPeople += peopleCount;
    }
    statsBySession.set(r.session_id, stat);
  }

  return statsBySession;
}
