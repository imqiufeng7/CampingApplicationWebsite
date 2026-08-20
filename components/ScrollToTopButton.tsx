"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon } from "lucide-react";

// Rendered inside each theme-scoped layout wrapper (app/(public)/layout.tsx and
// app/admin/layout.tsx), not the root layout — a plain fixed-position element still
// inherits --primary/etc. from its normal DOM ancestor (no portal needed here, unlike
// Dialogs/Toasts), so nesting it inside .theme-public/.theme-admin is enough to pick
// up the right theme colors on every page, public and admin alike.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  // Manual rAF-driven animation instead of `scrollTo({ behavior: "smooth" })` — that
  // native option silently no-ops in some Chromium builds (confirmed in this project's
  // own automated browser testing: the instant positional form works, the smooth
  // object form doesn't move the page at all), so it can't be trusted as the only path.
  function scrollToTop() {
    const startY = window.scrollY;
    if (startY === 0) return;
    const duration = 400;
    const startTime = performance.now();

    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, startY * (1 - eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="回到頂端"
      className="bg-primary text-primary-foreground fixed right-5 bottom-5 z-40 flex size-11 items-center justify-center rounded-full shadow-lg transition-opacity hover:opacity-90"
    >
      <ArrowUpIcon className="size-5" />
    </button>
  );
}
