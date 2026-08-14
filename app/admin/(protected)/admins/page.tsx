import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminUserCreateForm } from "@/components/admin/AdminUserCreateForm";
import { AdminUserRow } from "@/components/admin/AdminUserRow";

export default async function AdminsPage() {
  await requireRole("vendor");
  const supabase = await createClient();

  const [{ data: adminUsers }, { data: sessions }, { data: roles }] = await Promise.all([
    supabase
      .from("admin_users")
      .select("id, email, name, role_id, managed_session_ids")
      .order("created_at", { ascending: true }),
    supabase.from("event_sessions").select("id, name").order("created_at", { ascending: false }),
    supabase.from("admin_roles").select("id, key, label").order("is_system", { ascending: false }),
  ]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>邀請新管理員</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUserCreateForm sessions={sessions ?? []} roles={roles ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>管理員列表</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(adminUsers ?? []).map((au) => (
            <AdminUserRow key={au.id} adminUser={au} sessions={sessions ?? []} roles={roles ?? []} />
          ))}
          {(adminUsers ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">尚無管理員帳號</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
