import { cn } from "@/lib/utils";

// position: sticky (not fixed) — stays in normal document flow at first, so it never
// covers the intro content above it, then pins to the top of the viewport once
// scrolling would carry it past that point, same behavior on mobile and desktop. A
// top-to-bottom fade from the accent color to transparent keeps it legible even when
// it ends up overlapping whatever scrolls underneath.
export function ProgressDots({ sections }: { sections: { label: string; done: boolean }[] }) {
  const doneCount = sections.filter((s) => s.done).length;
  return (
    <div
      className={cn(
        "sticky top-0 z-40 -mx-4 grid gap-2 px-4 py-2.5 text-xs sm:mx-0 sm:rounded-xl sm:px-3",
        "bg-linear-to-b from-accent/70 via-accent/30 to-transparent backdrop-blur-sm"
      )}
    >
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(doneCount / sections.length) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-3 overflow-x-auto">
        {sections.map((s, i) => (
          <div key={i} className="flex shrink-0 items-center gap-1.5">
            <span
              key={`${i}-${s.done}`}
              className={cn(
                "size-2 shrink-0 rounded-full transition-colors",
                s.done ? "bg-primary animate-pop-in" : "bg-muted-foreground/30"
              )}
            />
            <span className={cn("whitespace-nowrap", s.done ? "text-foreground font-medium" : "text-muted-foreground")}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
