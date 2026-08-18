import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deriveStatusLabel, formatDateRange, computeSessionStats } from "@/lib/sessionStats";

export default async function PaymentsSessionPickerPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("event_sessions")
    .select("id, name, status, date_start, date_end")
    .order("created_at", { ascending: false });

  if (!admin.isVendor) {
    query = query.in("id", admin.managedSessionIds.length > 0 ? admin.managedSessionIds : [""]);
  }

  const { data: sessions } = await query;
  const statsBySession = await computeSessionStats(supabase, (sessions ?? []).map((s) => s.id));

  return (
    <div className="mx-auto grid max-w-2xl gap-3">
      <h1 className="text-lg font-semibold">選擇場次進行繳費核對</h1>
      {(sessions ?? []).map((s) => {
        const stat = statsBySession.get(s.id) ?? {
          registeredGroups: 0,
          admittedGroups: 0,
          registeredPeople: 0,
          admittedPeople: 0,
        };
        const statusInfo = deriveStatusLabel(s.status, s.date_start, s.date_end);
        return (
          <Link key={s.id} href={`/admin/payments/${s.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="grid gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
                <p className="text-muted-foreground text-sm">{formatDateRange(s.date_start, s.date_end)}</p>
                <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    錄取組數/報名組數：
                    <span className="text-foreground font-medium">{stat.admittedGroups} / {stat.registeredGroups}</span>
                  </span>
                  <span>
                    錄取人數/報名人數：
                    <span className="text-foreground font-medium">{stat.admittedPeople} / {stat.registeredPeople}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
      {(sessions ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">目前沒有可核對的場次</p>
      )}
    </div>
  );
}
