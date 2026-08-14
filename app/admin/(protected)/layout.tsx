import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth/session";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin();

  // middleware.ts already redirects unauthenticated users to /admin/login. This
  // handles the remaining case: a Supabase-authenticated user with no admin_users row.
  if (!admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-lg font-medium">此帳號尚未設定管理員角色</p>
        <p className="text-muted-foreground text-sm">
          請聯絡廠商角色協助建立 admin_users 資料
        </p>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="font-semibold">
            報名系統後台
          </Link>
          <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
            儀表板
          </Link>
          <Link href="/admin/reviews" className="text-muted-foreground hover:text-foreground">
            審核
          </Link>
          <Link href="/admin/payments" className="text-muted-foreground hover:text-foreground">
            繳費
          </Link>
          {admin.isVendor && (
            <>
              <Link href="/admin/series" className="text-muted-foreground hover:text-foreground">
                活動系列
              </Link>
              <Link href="/admin/admins" className="text-muted-foreground hover:text-foreground">
                管理員帳號
              </Link>
              <Link href="/admin/permissions" className="text-muted-foreground hover:text-foreground">
                權限設定
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {admin.email} · {admin.roleLabel}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
