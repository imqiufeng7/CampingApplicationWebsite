import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "@/components/public-form/RegistrationForm";

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("event_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "open") {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">此場次目前未開放報名</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          請確認網址是否正確，或洽詢主辦單位。
        </p>
      </div>
    );
  }

  // Server Component, evaluated fresh per request server-side (not a memoized
  // render) — reading the current time here is exactly the point, not a purity bug.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  if (
    (session.registration_open_at && now < new Date(session.registration_open_at).getTime()) ||
    (session.registration_close_at && now > new Date(session.registration_close_at).getTime())
  ) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">目前非報名開放時間</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          報名時間：
          {session.registration_open_at
            ? new Date(session.registration_open_at).toLocaleString("zh-TW")
            : "未設定"}{" "}
          ~{" "}
          {session.registration_close_at
            ? new Date(session.registration_close_at).toLocaleString("zh-TW")
            : "未設定"}
        </p>
      </div>
    );
  }

  if (session.capacity_total !== null) {
    const { count } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("is_cancelled", false);

    if ((count ?? 0) >= session.capacity_total) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-medium">報名名額已滿</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            此場次報名人數已達上限，如有名額釋出將由主辦單位另行公告。
          </p>
        </div>
      );
    }
  }

  const [{ data: series }, { data: identityTypes }, { data: feeCategories }] = await Promise.all([
    supabase.from("event_series").select("name").eq("id", session.series_id).maybeSingle(),
    supabase
      .from("session_identity_types")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("session_fee_categories")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div
      className="min-h-screen p-4 py-8"
      style={session.theme_color ? { backgroundColor: session.theme_color } : undefined}
    >
      <RegistrationForm
        session={session}
        seriesName={series?.name ?? ""}
        identityTypes={identityTypes ?? []}
        feeCategories={feeCategories ?? []}
      />
    </div>
  );
}
