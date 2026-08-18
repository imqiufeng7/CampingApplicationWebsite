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
import { deriveStatusLabel, formatDateRange, computeSessionStats } from "@/lib/sessionStats";

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
  const statsBySession = await computeSessionStats(supabase, sessionIds);

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
