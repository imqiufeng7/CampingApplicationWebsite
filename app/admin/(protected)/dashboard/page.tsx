import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityLogFeed } from "@/components/admin/ActivityLogFeed";

const REVIEW_COLORS: Record<string, string> = {
  審核中: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  審核通過: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  退回補件: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};
const ADMISSION_COLORS: Record<string, string> = {
  待確認: "bg-muted text-muted-foreground",
  正取: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  備取: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  取消: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};
const PAYMENT_COLORS: Record<string, string> = {
  已完成: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  待繳費: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  無需繳費: "bg-muted text-muted-foreground",
};

export default async function DashboardPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  let sessionsQuery = supabase
    .from("event_sessions")
    .select("id, name, series_id, status, capacity_total, admission_quota")
    .order("created_at", { ascending: false });

  if (!admin.isVendor) {
    sessionsQuery = sessionsQuery.in(
      "id",
      admin.managedSessionIds.length > 0 ? admin.managedSessionIds : [""]
    );
  }

  const { data: sessions } = await sessionsQuery;
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const [{ data: series }, { data: registrations }, { data: registrationCategories }, { data: activityLog }] =
    await Promise.all([
      supabase.from("event_series").select("id, name"),
      sessionIds.length
        ? supabase
            .from("registrations")
            .select(
              "id, session_id, registration_category_id, review_status, admission_status, payment_status, payment_amount, is_cancelled"
            )
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [] }),
      sessionIds.length
        ? supabase
            .from("session_registration_categories")
            .select("id, session_id, label, capacity_total, admission_quota")
            .in("session_id", sessionIds)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] }),
      sessionIds.length
        ? supabase
            .from("admin_activity_log")
            .select("session_id, admin_email, summary, created_at")
            .in("session_id", sessionIds)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] }),
    ]);

  const registrationIds = (registrations ?? []).map((r) => r.id);
  const { data: members } = registrationIds.length
    ? await supabase
        .from("registration_members")
        .select("registration_id")
        .in("registration_id", registrationIds)
    : { data: [] };

  const memberCountByRegistration = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByRegistration.set(
      m.registration_id,
      (memberCountByRegistration.get(m.registration_id) ?? 0) + 1
    );
  }

  const seriesNameMap = new Map((series ?? []).map((s) => [s.id, s.name]));

  const statsBySession = new Map<
    string,
    {
      totalGroups: number;
      cancelledGroups: number;
      totalPeople: number;
      reviewStatus: Record<string, number>;
      admissionStatus: Record<string, number>;
      paymentStatus: Record<string, number>;
      amountCollected: number;
      amountPending: number;
    }
  >();

  for (const sessionId of sessionIds) {
    statsBySession.set(sessionId, {
      totalGroups: 0,
      cancelledGroups: 0,
      totalPeople: 0,
      reviewStatus: {},
      admissionStatus: {},
      paymentStatus: {},
      amountCollected: 0,
      amountPending: 0,
    });
  }

  for (const r of registrations ?? []) {
    const stats = statsBySession.get(r.session_id);
    if (!stats) continue;

    stats.totalGroups += 1;
    if (r.is_cancelled) stats.cancelledGroups += 1;
    else stats.totalPeople += memberCountByRegistration.get(r.id) ?? 0;

    stats.reviewStatus[r.review_status] = (stats.reviewStatus[r.review_status] ?? 0) + 1;
    stats.admissionStatus[r.admission_status] = (stats.admissionStatus[r.admission_status] ?? 0) + 1;
    stats.paymentStatus[r.payment_status] = (stats.paymentStatus[r.payment_status] ?? 0) + 1;

    if (!r.is_cancelled) {
      if (r.payment_status === "已完成") stats.amountCollected += r.payment_amount;
      if (r.payment_status === "待繳費") stats.amountPending += r.payment_amount;
    }
  }

  const categoriesBySession = new Map<string, typeof registrationCategories>();
  for (const rc of registrationCategories ?? []) {
    const list = categoriesBySession.get(rc.session_id) ?? [];
    list.push(rc);
    categoriesBySession.set(rc.session_id, list);
  }

  const categoryStatsById = new Map<
    string,
    { activeGroups: number; admittedGroups: number; admittedPeople: number }
  >();
  for (const r of registrations ?? []) {
    if (!r.registration_category_id) continue;
    const stat = categoryStatsById.get(r.registration_category_id) ?? {
      activeGroups: 0,
      admittedGroups: 0,
      admittedPeople: 0,
    };
    if (!r.is_cancelled) {
      stat.activeGroups += 1;
      if (r.admission_status === "正取") {
        stat.admittedGroups += 1;
        stat.admittedPeople += memberCountByRegistration.get(r.id) ?? 0;
      }
    }
    categoryStatsById.set(r.registration_category_id, stat);
  }

  const activityBySession = new Map<string, { admin_email: string | null; summary: string; created_at: string }[]>();
  for (const a of activityLog ?? []) {
    const list = activityBySession.get(a.session_id) ?? [];
    list.push(a);
    activityBySession.set(a.session_id, list);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <h1 className="text-lg font-semibold">儀表板</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(sessions ?? []).map((s) => {
          const stats = statsBySession.get(s.id)!;
          const activeGroups = stats.totalGroups - stats.cancelledGroups;
          const admittedGroups = stats.admissionStatus["正取"] ?? 0;
          const overQuota = s.admission_quota != null && admittedGroups > s.admission_quota;
          const sessionCategories = categoriesBySession.get(s.id) ?? [];
          const activity = activityBySession.get(s.id) ?? [];
          return (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {seriesNameMap.get(s.series_id)} - {s.name}
                  </CardTitle>
                  <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Stat label="報名組數" value={activeGroups} />
                  <Stat label="總人數" value={stats.totalPeople} />
                  {sessionCategories.length === 0 && (
                    <>
                      <Stat
                        label="開放報名上限"
                        value={s.capacity_total ? `${activeGroups} / ${s.capacity_total}` : "未設定"}
                      />
                      <Stat
                        label="已錄取 / 錄取名額"
                        value={s.admission_quota ? `${admittedGroups} / ${s.admission_quota}` : "未設定"}
                        highlight={overQuota ? "warn" : undefined}
                      />
                    </>
                  )}
                  <Stat label="已取消" value={stats.cancelledGroups} />
                </div>

                {sessionCategories.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1.5 text-base">依報名類別</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {sessionCategories.map((rc) => {
                        const catStat = categoryStatsById.get(rc.id) ?? {
                          activeGroups: 0,
                          admittedGroups: 0,
                          admittedPeople: 0,
                        };
                        const catOverQuota =
                          rc.admission_quota != null && catStat.admittedGroups > rc.admission_quota;
                        return (
                          <div key={rc.id} className="rounded-lg border p-2">
                            <p className="mb-1 text-base font-medium">{rc.label}</p>
                            <p className="text-muted-foreground text-sm">
                              報名{" "}
                              <span className="text-foreground text-base font-semibold">
                                {catStat.activeGroups}
                              </span>
                              {rc.capacity_total ? ` / ${rc.capacity_total}` : ""}
                            </p>
                            <p
                              className={
                                catOverQuota
                                  ? "text-destructive text-sm font-medium"
                                  : "text-muted-foreground text-sm"
                              }
                            >
                              錄取{" "}
                              <span
                                className={
                                  catOverQuota
                                    ? "text-destructive text-base font-semibold"
                                    : "text-foreground text-base font-semibold"
                                }
                              >
                                {catStat.admittedGroups}
                              </span>
                              {rc.admission_quota ? ` / ${rc.admission_quota}` : ""}
                            </p>
                            <p className="text-muted-foreground mt-1 border-t pt-1 text-sm">
                              實際錄取人數{" "}
                              <span className="text-foreground text-base font-semibold">
                                {catStat.admittedPeople}
                              </span>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <StatusBlocks title="審核結果" counts={stats.reviewStatus} colors={REVIEW_COLORS} />
                <StatusBlocks title="錄取結果" counts={stats.admissionStatus} colors={ADMISSION_COLORS} />

                <div>
                  <p className="text-muted-foreground mb-1.5">繳費情況</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(stats.paymentStatus).map(([k, v]) => (
                      <div
                        key={k}
                        className={`rounded-lg border p-3 text-center ${PAYMENT_COLORS[k] ?? "bg-muted"}`}
                      >
                        <div className="text-2xl font-bold">{v}</div>
                        <div className="text-xs">{k}</div>
                      </div>
                    ))}
                    {stats.totalGroups === 0 && (
                      <span className="text-muted-foreground col-span-full">尚無資料</span>
                    )}
                  </div>
                  <div className="mt-2 rounded-lg border p-2 text-center">
                    <div className="font-mono">
                      <span className="text-lg font-semibold">
                        ${stats.amountCollected.toLocaleString("zh-TW")}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {" "}
                        / ${stats.amountPending.toLocaleString("zh-TW")}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">已收金額 / 待收金額</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/admin/reviews/${s.id}`}>
                    <Button type="button" variant="outline" size="sm">
                      前往審核
                    </Button>
                  </Link>
                </div>

                {activity.length > 0 && (
                  <details className="group">
                    <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-sm font-medium">
                      📝 異動紀錄（{activity.length}）
                      <span className="ml-1 inline-block transition-transform group-open:rotate-90">▶</span>
                    </summary>
                    <div className="mt-2">
                      <ActivityLogFeed entries={activity} />
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
        {(sessions ?? []).length === 0 && (
          <p className="text-muted-foreground text-sm">目前沒有可檢視的場次</p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "warn";
}) {
  return (
    <div
      className={
        highlight === "warn"
          ? "rounded-lg border-2 border-destructive p-2 text-center"
          : "rounded-lg border p-2 text-center"
      }
    >
      <div className={highlight === "warn" ? "text-destructive text-lg font-semibold" : "text-lg font-semibold"}>
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function StatusBlocks({
  title,
  counts,
  colors,
}: {
  title: string;
  counts: Record<string, number>;
  colors: Record<string, string>;
}) {
  const entries = Object.entries(counts);
  return (
    <div>
      <p className="text-muted-foreground mb-1.5">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map(([k, v]) => (
          <div key={k} className={`rounded-lg border p-3 text-center ${colors[k] ?? "bg-muted"}`}>
            <div className="text-2xl font-bold">{v}</div>
            <div className="text-xs">{k}</div>
          </div>
        ))}
        {entries.length === 0 && <span className="text-muted-foreground col-span-full">尚無資料</span>}
      </div>
    </div>
  );
}
