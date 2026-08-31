"use client";

import { Button } from "@/components/ui/button";

// A full navigation to the Route Handler, not a client-side signOut() — see
// force-signout/route.ts for why: it's the only place that can actually clear the
// httpOnly admin_login_at marker cookie alongside the real session.
export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        window.location.href = "/api/auth/force-signout";
      }}
    >
      登出
    </Button>
  );
}
