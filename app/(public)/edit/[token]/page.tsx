import { createClient } from "@/lib/supabase/server";
import { EditRegistrationForm } from "@/components/public-form/EditRegistrationForm";
import type { EditRegistrationData } from "@/lib/editRegistrationTypes";

export default async function EditRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("fn_get_registration_for_edit", { p_token: token });
  const registrationData = data as unknown as EditRegistrationData | null;

  if (!registrationData) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">連結無效</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          請確認連結是否正確，或洽詢主辦單位。
        </p>
      </div>
    );
  }

  if (registrationData.is_cancelled) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">此筆報名已取消</h1>
        <p className="text-muted-foreground mt-2 text-sm">如有疑問請洽詢主辦單位。</p>
      </div>
    );
  }

  const [{ data: session }, { data: identityTypes }, { data: feeCategories }, { data: registrationCategory }] =
    await Promise.all([
      supabase
        .from("event_sessions")
        .select("*")
        .eq("id", registrationData.session_id)
        .maybeSingle(),
      supabase
        .from("session_identity_types")
        .select("*")
        .eq("session_id", registrationData.session_id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("session_fee_categories")
        .select("*")
        .eq("session_id", registrationData.session_id)
        .order("sort_order", { ascending: true }),
      registrationData.registration_category_id
        ? supabase
            .from("session_registration_categories")
            .select("is_free")
            .eq("id", registrationData.registration_category_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  if (!session) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-medium">找不到對應場次</h1>
      </div>
    );
  }

  return (
    <div className="p-4 py-8">
      <EditRegistrationForm
        token={token}
        session={session}
        identityTypes={identityTypes ?? []}
        feeCategories={feeCategories ?? []}
        hideFeeCategory={registrationCategory?.is_free ?? false}
        data={registrationData}
      />
    </div>
  );
}
