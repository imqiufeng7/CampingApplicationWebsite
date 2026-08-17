"use client";

import { useEffect } from "react";

// Dialogs/dropdowns render via a portal straight into document.body (Base UI's
// default), which escapes any element the .theme-admin class is applied to — a
// popup would fall back to the root :root palette instead of the admin theme's
// colors. Applying the class to body itself instead of a wrapper div means
// portaled content (and the root-level <Toaster/>) inherits it too.
export function AdminThemeBody() {
  useEffect(() => {
    document.body.classList.add("theme-admin");
    return () => {
      document.body.classList.remove("theme-admin");
    };
  }, []);
  return null;
}
