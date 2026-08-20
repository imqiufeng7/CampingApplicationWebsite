import { ScrollToTopButton } from "@/components/ScrollToTopButton";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-public theme-public-bg text-foreground min-h-screen">
      {children}
      <ScrollToTopButton />
    </div>
  );
}
