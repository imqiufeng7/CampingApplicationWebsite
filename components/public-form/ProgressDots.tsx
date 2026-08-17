import { cn } from "@/lib/utils";

// Fixed positioning so progress stays visible while scrolling a long form: a sticky
// header bar on mobile (where floating in a corner would cover form fields), a
// floating card in the bottom-left corner on desktop (out of the way of the form
// itself). Removed from normal document flow either way — RegistrationForm adds
// top padding on mobile to keep this from covering the first section.
export function ProgressDots({ sections }: { sections: { label: string; done: boolean }[] }) {
  const doneCount = sections.filter((s) => s.done).length;
  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 fixed inset-x-0 top-0 z-40 grid gap-2 rounded-none px-3 py-2.5 text-xs shadow-md ring-1",
        "sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-auto sm:w-72 sm:rounded-xl sm:shadow-lg"
      )}
    >
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(doneCount / sections.length) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-3 overflow-x-auto sm:flex-wrap sm:overflow-visible">
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
