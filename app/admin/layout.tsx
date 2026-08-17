import { AdminThemeBody } from "@/components/admin/AdminThemeBody";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    // theme-admin stays on this div too (not just body) so the initial server-rendered
    // page has correct colors immediately — AdminThemeBody only needs to additionally
    // reach document.body once mounted, for portaled content (dialogs, toasts) that
    // renders outside this div's subtree. See AdminThemeBody for why that's necessary.
    <div className="theme-admin bg-background text-foreground min-h-screen">
      <AdminThemeBody />
      {children}
    </div>
  );
}
