import { cn } from "@/lib/utils";

export function ProgressDots({ sections }: { sections: { label: string; done: boolean }[] }) {
  const doneCount = sections.filter((s) => s.done).length;
  return (
    <div className="bg-card ring-foreground/10 grid gap-2 rounded-xl px-3 py-2.5 text-xs ring-1">
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(doneCount / sections.length) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {sections.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              key={`${i}-${s.done}`}
              className={cn(
                "size-2 rounded-full transition-colors",
                s.done ? "bg-primary animate-pop-in" : "bg-muted-foreground/30"
              )}
            />
            <span className={cn(s.done ? "text-foreground font-medium" : "text-muted-foreground")}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
