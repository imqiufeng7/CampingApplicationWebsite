"use client";

import { useEffect, useRef } from "react";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const STORAGE_KEY = "admin_last_activity";
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

// Belt to proxy.ts's 8-hour server-side timebox: this catches an admin who leaves the
// dashboard open and unattended without ever navigating away, which no server-side
// check can see since no request reaches the server while nothing is clicked. Reading
// last-activity from localStorage (not just a setTimeout) means a background/throttled
// tab still gets caught the moment it's brought back to the foreground.
export function IdleTimeout() {
  const signedOutRef = useRef(false);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    function recordActivity() {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWriteRef.current = now;
      localStorage.setItem(STORAGE_KEY, String(now));
    }

    // Mounting is itself a form of activity (a fresh page load, the browser reopened)
    // — but only once it's cleared the idle check. Stamping "now" unconditionally on
    // mount, before checking the *previous* value, would erase the one piece of
    // evidence that the tab sat closed/idle past the limit, so a closed browser
    // reopened after 30+ minutes would always look freshly active instead of expired.
    function checkIdle() {
      if (signedOutRef.current) return;
      const lastActivityRaw = localStorage.getItem(STORAGE_KEY);
      const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : null;
      if (lastActivity !== null && Date.now() - lastActivity >= IDLE_LIMIT_MS) {
        signedOutRef.current = true;
        // Full navigation, not router.replace() + client signOut() — see
        // force-signout/route.ts for why this is the only place that can actually
        // clear the httpOnly admin_login_at cookie alongside the real session.
        window.location.href = "/api/auth/force-signout?reason=idle";
        return;
      }
      recordActivity();
    }

    checkIdle();

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, recordActivity, { passive: true })
    );
    document.addEventListener("visibilitychange", checkIdle);
    const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, recordActivity));
      document.removeEventListener("visibilitychange", checkIdle);
      clearInterval(interval);
    };
  }, []);

  return null;
}
