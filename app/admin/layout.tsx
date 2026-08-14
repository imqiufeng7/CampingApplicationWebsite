export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-admin bg-background text-foreground min-h-screen">{children}</div>;
}
