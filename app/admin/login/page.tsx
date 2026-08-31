"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/app/admin/login/actions";
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

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>請查收信箱</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            若 {email} 是有效的管理員帳號，我們已經寄出重設密碼的連結，請至信箱查收（含垃圾郵件匣）。
          </p>
          <Button type="button" variant="outline" onClick={onBack}>
            返回登入
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>忘記密碼</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="reset-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "寄送中..." : "寄送重設密碼連結"}
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            返回登入
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const loginSchema = z.object({
  email: z.string().email("請輸入有效的 Email"),
  password: z.string().min(1, "請輸入密碼"),
});

type LoginValues = z.infer<typeof loginSchema>;

const SESSION_END_REASON_MESSAGE: Record<string, string> = {
  idle: "閒置超過 30 分鐘，已自動登出，請重新登入。",
  expired: "登入已超過 8 小時工作階段上限，請重新登入。",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const reason = searchParams.get("reason");
  const sessionEndMessage = reason ? SESSION_END_REASON_MESSAGE[reason] : null;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword(values);

    if (signInError) {
      setError("登入失敗，請確認帳號密碼");
      setSubmitting(false);
      return;
    }

    // Otherwise a stale timestamp from whatever logged this admin out last time (idle
    // or expired) makes IdleTimeout's mount-time check see this brand new session as
    // already-idle, signing them straight back out a few seconds after landing.
    localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);

    const redirectTo = searchParams.get("redirectTo") ?? "/admin";
    router.replace(redirectTo);
    router.refresh();
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>後台登入</CardTitle>
      </CardHeader>
      <CardContent>
        {sessionEndMessage && (
          <p className="bg-secondary text-secondary-foreground mb-4 rounded-md px-3 py-2 text-sm">
            {sessionEndMessage}
          </p>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密碼</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "登入中..." : "登入"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowForgotPassword(true)}
            >
              忘記密碼？
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
