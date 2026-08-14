import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";

export default async function AdminHomePage() {
  const admin = await getCurrentAdmin();

  if (admin?.isVendor) {
    redirect("/admin/series");
  }
  redirect("/admin/dashboard");
}
