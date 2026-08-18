"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
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

// Supabase's invite/magic-link/recovery email lands here with the session encoded in
// the URL (hash fragment for implicit flow, or ?code= for PKCE).
//
// This page must NEVER trust an already-existing browser session as "this is the
// invited/recovering account" — if admin A is logged in and clicks a link meant for
// B, a plain getSession() would silently return A's session (nothing in the URL ever
// gets checked), and "設定密碼" would overwrite A's own password instead of setting
// up B's. So: only treat the page as valid if the URL itself actually carries fresh
// auth tokens; otherwise show "invalid" regardless of any ambient session. The
// resulting account's email is also shown before the password form so a mismatch is
// visually obvious rather than silent.
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

type Status = "checking" | "ready" | "invalid" | "done";

function urlCarriesAuthToken(): boolean {
  const hash = window.location.hash;
  if (hash.includes("access_token") || hash.includes("refresh_token")) return true;
  const params = new URLSearchParams(window.location.search);
  return params.has("code") || params.has("token_hash");
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!urlCarriesAuthToken()) {
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
