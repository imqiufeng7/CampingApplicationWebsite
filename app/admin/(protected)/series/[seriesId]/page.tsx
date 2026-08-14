import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeriesEditForm } from "@/components/admin/SeriesEditForm";
import { SessionForm } from "@/components/admin/SessionForm";
import { CloneSessionForm } from "@/components/admin/CloneSessionForm";

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
      .select("id, name, location, status")
      .eq("series_id", seriesId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_sessions")
      .select("id, name, series_id")
      .order("created_at", { ascending: false }),
    supabase.from("event_series").select("id, name"),
  ]);

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
          {(sessions ?? []).map((s) => (
            <Link key={s.id} href={`/admin/series/${seriesId}/sessions/${s.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-muted-foreground text-sm">{s.location}</p>
                  </div>
                  <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
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
