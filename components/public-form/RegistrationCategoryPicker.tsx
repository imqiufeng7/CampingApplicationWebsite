"use client";

import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/public-form/SectionCard";
import type { Database } from "@/lib/db/types";

type RegistrationCategory = Database["public"]["Tables"]["session_registration_categories"]["Row"] & {
  isFull: boolean;
};

// Cycled across cards purely for visual variety, echoing the poster's mixed accent
// colors (ribbon red / sky blue / hill green) — not tied to category meaning.
const ACCENTS = ["var(--primary)", "var(--poster-blue)", "var(--poster-green)"];

export function RegistrationCategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: RegistrationCategory[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  return (
    <SectionCard title="請選擇報名類別（必選）" delay={240} contentClassName="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((c, i) => {
          const accent = ACCENTS[i % ACCENTS.length];
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              disabled={c.isFull}
              onClick={() => onChange(c.id)}
              style={{ borderColor: selected ? accent : undefined }}
              className={cn(
                "animate-fade-up relative rounded-2xl border-2 p-4 text-left transition-all",
                selected
                  ? "shadow-md"
                  : c.isFull
                    ? "border-border bg-muted grayscale cursor-not-allowed"
                    : "border-border hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-sm"
              )}
            >
              {selected && (
                <span
                  style={{ backgroundColor: accent }}
                  className="animate-pop-in absolute -top-2 -right-2 grid size-6 place-items-center rounded-full text-xs text-white shadow"
                >
                  ✓
                </span>
              )}
              <div
                className={cn("font-bold", c.isFull && "text-muted-foreground")}
                style={{ color: selected ? accent : undefined }}
              >
                {c.label}
              </div>
              <div className="text-muted-foreground text-sm">
                每筆最多 {c.max_members} 人{c.isFull ? "・已額滿" : ""}
              </div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}
