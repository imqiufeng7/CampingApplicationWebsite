import { cn } from "@/lib/utils";

export function ProgressDots({ sections }: { sections: { label: string; done: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {sections.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-2 rounded-full",
              s.done ? "bg-primary" : "bg-muted-foreground/30"
            )}
          />
          <span className={cn(s.done ? "text-foreground" : "text-muted-foreground")}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
