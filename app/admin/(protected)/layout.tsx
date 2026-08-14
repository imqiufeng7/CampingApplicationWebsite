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

  const linkClass =
    "text-muted-foreground hover:text-primary font-medium transition-colors";

  return (
    <div className="min-h-screen">
      <div
        className="h-1"
        style={{
          background:
            "linear-gradient(90deg, var(--primary), var(--accent), var(--poster-blue))",
        }}
        aria-hidden
      />
      <header className="bg-card border-border flex items-center justify-between border-b px-4 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="text-primary flex items-center gap-1.5 font-bold">
            🏕️ 報名系統後台
          </Link>
          <Link href="/admin/dashboard" className={linkClass}>
            儀表板
          </Link>
          <Link href="/admin/reviews" className={linkClass}>
            審核
          </Link>
          <Link href="/admin/payments" className={linkClass}>
            繳費
          </Link>
          {admin.isVendor && (
            <>
              <span className="bg-border h-4 w-px" aria-hidden />
              <Link href="/admin/series" className={linkClass}>
                活動系列
              </Link>
              <Link href="/admin/admins" className={linkClass}>
                管理員帳號
              </Link>
              <Link href="/admin/permissions" className={linkClass}>
                權限設定
              </Link>
              <Link href="/admin/email-templates" className={linkClass}>
                Email 範本
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium">
            {admin.email} · {admin.roleLabel}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
