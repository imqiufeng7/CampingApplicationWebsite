import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeriesEditForm } from "@/components/admin/SeriesEditForm";
import { SessionForm } from "@/components/admin/SessionForm";
import { CloneSessionForm } from "@/components/admin/CloneSessionForm";
import { DeleteSessionButton } from "@/components/admin/DeleteSessionButton";

// Derived from status + dates rather than the raw draft/open/closed/archived enum —
// what the vendor actually wants to know at a glance is whether people can still
// register, whether the event itself is happening right now, or whether it's over.
function deriveStatusLabel(
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

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "尚未設定活動時間";
  const fmt = (s: string) => new Date(s).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return end ? `${fmt(start)} - ${fmt(end)}` : fmt(start);
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  await requireRole("vendor");
  const { seriesId } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from("event_series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series) {
    notFound();
  }

  const [{ data: sessions }, { data: allSessions }, { data: allSeries }] = await Promise.all([
    supabase
      .from("event_sessions")
      .select("id, name, location, status, date_start, date_end")
      .eq("series_id", seriesId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_sessions")
      .select("id, name, series_id")
      .order("created_at", { ascending: false }),
    supabase.from("event_series").select("id, name"),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: registrations } = sessionIds.length
    ? await supabase
        .from("registrations")
        .select("id, session_id, admission_status, is_cancelled")
        .in("session_id", sessionIds)
    : { data: [] };

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const { data: members } = registrationIds.length
    ? await supabase.from("registration_members").select("registration_id").in("registration_id", registrationIds)
    : { data: [] };
  const memberCountByRegistration = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByRegistration.set(m.registration_id, (memberCountByRegistration.get(m.registration_id) ?? 0) + 1);
  }

  const statsBySession = new Map<
    string,
    { registeredGroups: number; admittedGroups: number; registeredPeople: number; admittedPeople: number }
  >();
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

  const seriesNameMap = new Map((allSeries ?? []).map((s) => [s.id, s.name]));
  const cloneCandidates = (allSessions ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    seriesName: seriesNameMap.get(s.series_id) ?? "",
  }));

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>系列設定</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesEditForm series={series} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>場次列表</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(sessions ?? []).map((s) => {
            const stat = statsBySession.get(s.id) ?? {
              registeredGroups: 0,
              admittedGroups: 0,
              registeredPeople: 0,
              admittedPeople: 0,
            };
            const statusInfo = deriveStatusLabel(s.status, s.date_start, s.date_end);
            return (
              <Card key={s.id} className="transition-colors hover:bg-muted/50">
                <CardContent className="grid gap-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/series/${seriesId}/sessions/${s.id}`} className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-muted-foreground text-sm">{s.location}</p>
                      <p className="text-muted-foreground text-sm">{formatDateRange(s.date_start, s.date_end)}</p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      <DeleteSessionButton seriesId={seriesId} sessionId={s.id} sessionName={s.name} />
                    </div>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span>
                      錄取組數/報名組數：<span className="text-foreground font-medium">{stat.admittedGroups} / {stat.registeredGroups}</span>
                    </span>
                    <span>
                      錄取人數/報名人數：<span className="text-foreground font-medium">{stat.admittedPeople} / {stat.registeredPeople}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(sessions ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">尚未建立任何場次</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>新增場次</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CloneSessionForm seriesId={seriesId} otherSessions={cloneCandidates} />
          <SessionForm seriesId={seriesId} />
        </CardContent>
      </Card>
    </div>
  );
}
