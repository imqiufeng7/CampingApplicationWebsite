import { cn } from "@/lib/utils";

// Public-form-only section wrapper: the title sits in its own colored band, flush
// with the card's top edge and visually independent from the white content area
// below — distinct from the shared admin `Card`, which has a single flat surface.
export function SectionCard({
  title,
  action,
  delay = 0,
  className,
  contentClassName,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  delay?: number;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        // Softer, more spacious card treatment (larger radius, a colored glow instead
        // of a flat border) — closer to the reference layout the client liked, while
        // keeping our own poster-derived palette instead of copying its colors.
        "animate-fade-up ring-foreground/10 shadow-foreground/10 overflow-hidden rounded-2xl bg-card shadow-xl ring-1",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="bg-secondary text-secondary-foreground flex items-center justify-between gap-2 px-5 py-3">
        <h2 className="font-heading text-base font-bold">{title}</h2>
        {action}
      </div>
      <div className={cn("p-5 text-sm sm:p-6", contentClassName)}>{children}</div>
    </div>
  );
}
