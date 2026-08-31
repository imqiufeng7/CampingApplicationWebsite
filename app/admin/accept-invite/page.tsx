"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { LAST_ACTIVITY_STORAGE_KEY } from "@/components/admin/IdleTimeout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Supabase's invite/magic-link/recovery email lands here.
//
// This page must NEVER trust an already-existing browser session as "this is the
// invited/recovering account" — if admin A is logged in and clicks a link meant for
// B, a plain getSession() would silently return A's session (nothing in the URL ever
// gets checked), and "設定密碼" would overwrite A's own password instead of setting
// up B's. So: only treat the page as valid if the URL itself actually carries fresh
// auth tokens; otherwise show "invalid" regardless of any ambient session. The
// resulting account's email is also shown before the password form so a mismatch is
// visually obvious rather than silent.
//
// We email our own URL carrying a raw ?token_hash=&type= (see admins/actions.ts),
// never Supabase's action_link — that's a plain GET to auth/v1/verify, and mail
// providers' link-scanners pre-fetch every link in an email to check it for malware,
// silently consuming the one-time token before the human ever clicks. So verifyOtp
// is only ever called from an explicit button click on this page, never
// automatically on page load — a scanner fetching this URL doesn't click buttons.
const passwordSchema = z
  .object({
    password: z.string().min(8, "密碼至少需要 8 個字元"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "兩次輸入的密碼不一致",
    path: ["confirmPassword"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

type Status = "checking" | "confirm" | "ready" | "invalid" | "done";

type TokenParams = { token_hash: string; type: string };

// Legacy support only — older already-sent emails may still use Supabase's
// action_link format (hash-fragment tokens or ?code=), which auto-establishes a
// session via the client SDK's own detectSessionInUrl. New emails no longer use
// this format (see the file-level comment), so this path can eventually be removed
// once no old emails are in circulation.
function legacyUrlCarriesAuthToken(): boolean {
  const hash = window.location.hash;
  if (hash.includes("access_token") || hash.includes("refresh_token")) return true;
  const params = new URLSearchParams(window.location.search);
  return params.has("code");
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tokenParams, setTokenParams] = useState<TokenParams | null>(null);

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && type) {
      Promise.resolve().then(() => {
        setTokenParams({ token_hash: tokenHash, type });
        setStatus("confirm");
      });
      return;
    }
    if (!legacyUrlCarriesAuthToken()) {
      Promise.resolve().then(() => setStatus("invalid"));
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setStatus("invalid");
        return;
      }
      setAccountEmail(data.session.user.email ?? null);
      setStatus("ready");
    });
  }, []);

  async function handleConfirm() {
    if (!tokenParams) return;
    setConfirming(true);
    setError(null);
    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp(tokenParams);
    if (verifyError || !data.session) {
      setStatus("invalid");
      setConfirming(false);
      return;
    }
    setAccountEmail(data.session.user.email ?? null);
    setStatus("ready");
    setConfirming(false);
  }

  async function onSubmit(values: PasswordValues) {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: values.password });

    if (updateError) {
      setError("設定密碼失敗，請重新整理頁面後再試一次");
      setSubmitting(false);
      return;
    }

    // Same reason as the login page: a stale timestamp from a previous admin's
    // idle-timeout on this same browser would otherwise make IdleTimeout's mount-time
    // check see this brand new session as already-idle.
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);

    setStatus("done");
    router.replace("/admin");
    router.refresh();
  }

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">確認邀請連結中...</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>邀請連結無效或已過期</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              請聯絡系統管理者（廠商角色）重新寄送邀請信。若您已經設定過密碼，請直接
              <a href="/admin/login" className="text-primary underline">
                登入
              </a>
              ，忘記密碼可以在登入頁使用「忘記密碼」重設。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "confirm") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>確認邀請連結</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-muted-foreground text-sm">
              請點擊下方按鈕繼續設定您的登入密碼。
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button onClick={handleConfirm} disabled={confirming} className="w-full">
              {confirming ? "確認中..." : "繼續"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>設定您的登入密碼</CardTitle>
        </CardHeader>
        <CardContent>
          {accountEmail && (
            <p className="bg-secondary text-secondary-foreground mb-4 rounded-lg px-3 py-2 text-sm">
              正在設定帳號：<span className="font-medium">{accountEmail}</span>
              <br />
              請確認這是您本人的信箱，若不是請勿繼續設定。
            </p>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密碼</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>確認密碼</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "設定中..." : "設定密碼並登入"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
