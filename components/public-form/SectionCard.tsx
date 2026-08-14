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
        "animate-fade-up ring-foreground/10 overflow-hidden rounded-xl bg-card ring-1",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="bg-secondary text-secondary-foreground flex items-center justify-between gap-2 px-4 py-2.5">
        <h2 className="font-heading text-base font-bold">{title}</h2>
        {action}
      </div>
      <div className={cn("p-4 text-sm", contentClassName)}>{children}</div>
    </div>
  );
}
