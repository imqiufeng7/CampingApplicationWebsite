import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent } from "@/components/ui/card";

export default async function PaymentsSessionPickerPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("event_sessions")
    .select("id, name, status")
    .order("created_at", { ascending: false });

  if (!admin.isVendor) {
    query = query.in("id", admin.managedSessionIds.length > 0 ? admin.managedSessionIds : [""]);
  }

  const { data: sessions } = await query;

  return (
    <div className="mx-auto grid max-w-2xl gap-3">
      <h1 className="text-lg font-semibold">選擇場次進行繳費核對</h1>
      {(sessions ?? []).map((s) => (
        <Link key={s.id} href={`/admin/payments/${s.id}`}>
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center justify-between py-3">
              <span>{s.name}</span>
              <span className="text-muted-foreground text-sm">{s.status}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
      {(sessions ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">目前沒有可核對的場次</p>
      )}
    </div>
  );
}
