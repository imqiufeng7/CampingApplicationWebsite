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
}: {
  options: { value: number; label: string }[];
  value: number | undefined;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScroll = useRef(false);

  const selectedIndex = value !== undefined ? options.findIndex((o) => o.value === value) : -1;

  // Keep the wheel's scroll position in sync when `value` changes from outside
  // (e.g. loading existing data into the edit form) — guarded so the resulting
  // programmatic scroll doesn't immediately re-fire onChange via handleScroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || selectedIndex < 0) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      isProgrammaticScroll.current = true;
      el.scrollTo({ top: target, behavior: "auto" });
    }
  }, [selectedIndex]);

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
