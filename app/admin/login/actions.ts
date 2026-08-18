"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailAdapter } from "@/lib/email";

export type ActionState = { error: string | null; sent: boolean };

// Publicly callable (no auth required — that's the point of "forgot password"), so
// this must never reveal whether an email is actually registered: always the same
// generic response regardless. Uses our own adapter rather than Supabase's built-in
// recovery mail (same reason as the admin invite fix — reliability, and the site's
// own Redirect URL configuration is what determines where the link lands).
export async function requestPasswordReset(email: string): Promise<ActionState> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "請輸入 Email", sent: false };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers();
  const user = existing?.users.find((u) => u.email === trimmed);

  // Only send for an account that's actually an active admin_users row — a Supabase
  // Auth user with no admin_users row (or one that never activated) shouldn't be
  // handed a password-set link through this route at all.
  if (user?.last_sign_in_at) {
    const { data: adminRow } = await admin.from("admin_users").select("id").eq("id", user.id).maybeSingle();
    if (adminRow) {
      const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/accept-invite`;
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: trimmed,
        options: { redirectTo },
      });

      if (!linkError && linkData?.properties.action_link) {
        const adapter = getEmailAdapter();
        await adapter.sendEmail({
          to: trimmed,
          subject: "【報名系統後台】重設密碼",
          body: `您好，

我們收到您在報名系統後台重設密碼的請求。請點擊以下連結設定新密碼：
${linkData.properties.action_link}

請妥善保存此連結，勿轉發給他人。若非本人操作，請忽略此信，您的密碼不會被更動。
`,
        });
      }
    }
  }

  return { error: null, sent: true };
}
