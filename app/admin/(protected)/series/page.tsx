import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeriesCreateForm } from "@/components/admin/SeriesCreateForm";

export default async function SeriesListPage() {
  await requireRole("vendor");
  const supabase = await createClient();

  const { data: seriesList } = await supabase
    .from("event_series")
    .select("id, name, year, status")
    .order("year", { ascending: false });

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>新增活動系列</CardTitle>
        </CardHeader>
        <CardContent>
          <SeriesCreateForm />
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {(seriesList ?? []).map((series) => (
          <Link key={series.id} href={`/admin/series/${series.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{series.name}</p>
                  <p className="text-muted-foreground text-sm">{series.year} 年</p>
                </div>
                <Badge variant={series.status === "open" ? "default" : "secondary"}>
                  {series.status}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(seriesList ?? []).length === 0 && (
          <p className="text-muted-foreground text-sm">尚未建立任何活動系列</p>
        )}
      </div>
    </div>
  );
}
