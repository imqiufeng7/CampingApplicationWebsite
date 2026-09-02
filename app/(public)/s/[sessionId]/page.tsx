import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "@/components/public-form/RegistrationForm";
import { TAIPEI_TIME_ZONE } from "@/lib/timezone";

// Overrides the root layout's generic "報名系統 / 客製化活動報名系統" for this one
// route — that generic text is what shows up as the title/description when this
// link's card gets previewed (LINE, etc.), which isn't useful for telling one
// session's link apart from another's.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("event_sessions")
    .select("name, series_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return {};

  const { data: series } = await supabase
    .from("event_series")
    .select("name")
    .eq("id", session.series_id)
    .maybeSingle();

  const title = series ? `${series.name} - ${session.name}` : session.name;
  return { title, description: `${title}｜線上報名` };
}

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
            ? new Date(session.registration_open_at).toLocaleString("zh-TW", { hour12: false, timeZone: TAIPEI_TIME_ZONE })
            : "未設定"}{" "}
          ~{" "}
          {session.registration_close_at
            ? new Date(session.registration_close_at).toLocaleString("zh-TW", { hour12: false, timeZone: TAIPEI_TIME_ZONE })
            : "未設定"}
        </p>
      </div>
    );
  }

  const { data: registrationCategoriesRaw } = await supabase
    .from("session_registration_categories")
    .select("*")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });
  const registrationCategories = registrationCategoriesRaw ?? [];
  const hasCategories = registrationCategories.length > 0;

  // Capacity is either session-wide (no categories defined — original behavior) or
  // per-category (see the category-count block below); never both, matching
  // fn_submit_registration's own branching.
  //
  // Both counts go through SECURITY DEFINER RPCs rather than a direct query — anon has
  // no SELECT policy on registrations at all (by design, to keep PII unreadable to the
  // public), so a direct .select() here would always silently return zero rows and
  // this "額滿" gate would never actually trigger for a real visitor.
  if (!hasCategories && session.capacity_total !== null) {
    const { data: count } = await supabase.rpc("fn_get_session_registration_count", {
      p_session_id: sessionId,
    });

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

  let categoriesWithAvailability = registrationCategories.map((rc) => ({ ...rc, isFull: false }));
  if (hasCategories) {
    const { data: categoryCounts } = await supabase.rpc("fn_get_category_registration_counts", {
      p_session_id: sessionId,
    });

    const countByCategory = new Map<string, number>();
    for (const row of categoryCounts ?? []) {
      countByCategory.set(row.registration_category_id, row.registration_count);
    }

    categoriesWithAvailability = registrationCategories.map((rc) => ({
      ...rc,
      isFull: rc.capacity_total !== null && (countByCategory.get(rc.id) ?? 0) >= rc.capacity_total,
    }));

    // All categories full — same "額滿" gate as the no-categories path above.
    if (categoriesWithAvailability.every((rc) => rc.isFull)) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-lg font-medium">報名名額已滿</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            此場次各類別報名人數皆已達上限，如有名額釋出將由主辦單位另行公告。
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
        registrationCategories={categoriesWithAvailability}
      />
    </div>
  );
}
