"use client";

import { useEffect, useRef } from "react";

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 5;
const PADDING_COUNT = Math.floor(VISIBLE_COUNT / 2);

export function WheelColumn({
  options,
  value,
  onChange,
  ariaLabel,
  initialIndex,
}: {
  options: { value: number; label: string }[];
  // react-hook-form's actual runtime value for an unset numeric field is "" (an
  // empty string from the form's defaultValues), not undefined, despite what this
  // type claims — a plain `=== undefined` check silently never matches. hasValue
  // below is the one place that needs to know the real story.
  value: number | undefined;
  onChange: (value: number) => void;
  ariaLabel: string;
  // Scroll position to land on before the registrant has picked anything (e.g. the
  // middle of the most common birth-year range).
  initialIndex?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScroll = useRef(false);
  const didInitRef = useRef(false);

  const hasValue = value !== undefined && value !== null && (value as unknown) !== "";
  const selectedIndex = hasValue ? options.findIndex((o) => o.value === value) : -1;

  // Keep the wheel's scroll position in sync when `value` changes from outside
  // (e.g. loading existing data into the edit form) — guarded so the resulting
  // programmatic scroll doesn't immediately re-fire onChange via handleScroll.
  // Before any real value exists, land on `initialIndex` once instead of index 0.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (selectedIndex >= 0) {
      const target = selectedIndex * ITEM_HEIGHT;
      if (Math.abs(el.scrollTop - target) > 1) {
        isProgrammaticScroll.current = true;
        el.scrollTo({ top: target, behavior: "auto" });
      }
      didInitRef.current = true;
      return;
    }
    if (!didInitRef.current && initialIndex !== undefined) {
      isProgrammaticScroll.current = true;
      el.scrollTo({ top: initialIndex * ITEM_HEIGHT, behavior: "auto" });
      didInitRef.current = true;
    }
  }, [selectedIndex, initialIndex]);

  // Commits whatever's already centered as the real value on mount, rather than
  // waiting for the registrant to scroll. Without this, a value that happens to
  // already match the default position (e.g. someone born in January never needs to
  // touch the month wheel, since "1 月" is already showing) never fires onChange at
  // all — the field silently stays unset even though the correct value was visibly
  // selected the whole time.
  useEffect(() => {
    if (!hasValue) {
      const option = options[initialIndex ?? 0];
      if (option) onChange(option.value);
    }
    // Mount-only: this establishes the starting value once. `value` afterwards is
    // owned by the parent form, and options/onChange are stable enough in practice
    // that re-running this on every identity change would fight the user's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      return;
    }
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(options.length - 1, index));
      const option = options[clamped];
      if (option && option.value !== value) {
        onChange(option.value);
      }
    }, 120);
  }

  return (
    <div
      className="relative"
      style={{ height: ITEM_HEIGHT * VISIBLE_COUNT }}
      aria-label={ariaLabel}
    >
      <div
        className="border-primary/40 pointer-events-none absolute top-1/2 right-0 left-0 -translate-y-1/2 border-y"
        style={{ height: ITEM_HEIGHT }}
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scrollbar-none h-full overflow-y-auto"
        style={{ scrollSnapType: "y mandatory" }}
      >
        <div style={{ height: ITEM_HEIGHT * PADDING_COUNT }} />
        {options.map((opt) => (
          <div
            key={opt.value}
            className={
              opt.value === value
                ? "text-foreground flex items-center justify-center text-sm font-medium"
                : "text-muted-foreground flex items-center justify-center text-sm"
            }
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center" }}
          >
            {opt.label}
          </div>
        ))}
        <div style={{ height: ITEM_HEIGHT * PADDING_COUNT }} />
      </div>
    </div>
  );
}
