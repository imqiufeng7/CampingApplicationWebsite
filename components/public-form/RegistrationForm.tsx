"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createClient } from "@/lib/supabase/client";
import {
  buildRegistrationSchema,
  emptyMember,
  resolveIdentityTypeId,
  type RegistrationFormInput,
  type RegistrationFormOutput,
} from "@/lib/validation/registration-schema";
import type { Database } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ProgressDots } from "@/components/public-form/ProgressDots";
import { MemberFieldGroup } from "@/components/public-form/MemberFieldGroup";
import { ConsentSection } from "@/components/public-form/ConsentSection";
import { ConsentGate } from "@/components/public-form/ConsentGate";
import { RichContent } from "@/components/public-form/RichContent";

type EventSession = Database["public"]["Tables"]["event_sessions"]["Row"];
type IdentityType = Database["public"]["Tables"]["session_identity_types"]["Row"];
type FeeCategory = Database["public"]["Tables"]["session_fee_categories"]["Row"];

const DEFAULT_RULES_TEXT = `1. 報名資料送出後，將由主辦單位進行資格審核，審核結果將以 Email 通知。
2. 請確實填寫聯絡資訊，以利後續通知與繳費作業。
3. 依規定需繳費者，請於期限內完成繳費，逾期視同放棄資格。
4. 如需取消報名，請於活動前依主辦單位公告期限辦理，逾期恕不受理退費。`;

const DEFAULT_SUCCESS_MESSAGE = `您的報名資料已送出。
我們將盡快審核完成，並於公告頁面公布錄取名單，謝謝！
如有對報名流程或繳費等任何疑問，請洽詢主辦單位。`;

function bannerUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/session-assets/${path}`;
}

export function RegistrationForm({
  session,
  seriesName,
  identityTypes,
  feeCategories,
}: {
  session: EventSession;
  seriesName: string;
  identityTypes: IdentityType[];
  feeCategories: FeeCategory[];
}) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    registrationId: string;
    registrationNo: string;
  } | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const activityTitle = seriesName ? `${seriesName}-${session.name}` : session.name;

  const schema = useMemo(
    () =>
      buildRegistrationSchema({
        maxMembers: session.max_members_per_registration,
        identityTypes,
        feeCategories,
      }),
    [session.max_members_per_registration, identityTypes, feeCategories]
  );

  const form = useForm<RegistrationFormInput, unknown, RegistrationFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      contact_email: "",
      contact_phone: "",
      members: [emptyMember()],
      agree_rules: false,
      agree_privacy: false,
    },
    mode: "onBlur",
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "members" });
  const watchedMembers = useWatch({ control: form.control, name: "members" });
  const contactEmail = useWatch({ control: form.control, name: "contact_email" });
  const agreeRules = useWatch({ control: form.control, name: "agree_rules" });
  const agreePrivacy = useWatch({ control: form.control, name: "agree_privacy" });

  async function onSubmit(values: RegistrationFormOutput) {
    setSubmitError(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc("fn_submit_registration", {
      payload: {
        session_id: session.id,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone,
        members: values.members.map((m, i) => ({
          member_order: i,
          name: m.name,
          id_number: m.id_number,
          household_address: m.household_address,
          birth_year_roc: m.birth_year_roc,
          birth_month: m.birth_month,
          birth_day: m.birth_day,
          gender: m.gender,
          identity_type_id: resolveIdentityTypeId(m.is_staff, identityTypes),
          org_selected: m.org_selected || null,
          org_other_text: m.org_other_text || null,
          fee_category_id: m.fee_category_id || null,
          files: m.files,
        })),
      },
    });

    if (error) {
      setSubmitError(error.message ?? "送出失敗，請稍後再試");
      return;
    }

    const row = (data as { registration_id: string; registration_no: string }[])[0];
    setSubmitResult({ registrationId: row.registration_id, registrationNo: row.registration_no });

    // Best-effort — the confirmation email (with the edit link) isn't required for the
    // submission itself to have succeeded, so a failure here doesn't block the success
    // view; the registrant can still hit "重新寄送" themselves.
    fetch(`/api/registrations/${row.registration_id}/send-confirmation`, { method: "POST" }).catch(
      () => {}
    );
  }

  async function handleResend() {
    if (!submitResult) return;
    setResendState("sending");
    try {
      const res = await fetch(`/api/registrations/${submitResult.registrationId}/send-confirmation`, {
        method: "POST",
      });
      setResendState(res.ok ? "sent" : "error");
    } catch {
      setResendState("error");
    }
  }

  if (submitResult) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>報名已送出</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <RichContent html={session.success_message_text || DEFAULT_SUCCESS_MESSAGE} />
          <p className="text-muted-foreground">報名編號：{submitResult.registrationNo}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resendState === "sending"}
              onClick={handleResend}
            >
              {resendState === "sending"
                ? "寄送中..."
                : resendState === "sent"
                  ? "已重新寄出"
                  : "將報名資料副本寄到我的 Email"}
            </Button>
            {session.redirect_url && (
              <a href={session.redirect_url} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" size="sm">
                  {session.redirect_label || "前往活動官網"}
                </Button>
              </a>
            )}
          </div>
          {resendState === "error" && (
            <p className="text-destructive text-sm">寄送失敗，請稍後再試</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Shown both before agreeing (so registrants read everything about the activity
  // first) and while filling out the form (kept visible for reference) — only the
  // gate vs. the actual input fields swap below it.
  const introContent = (
    <>
      {session.banner_image_path && (
        <div className="relative aspect-3/1 w-full overflow-hidden rounded-lg">
          <Image
            src={bannerUrl(session.banner_image_path)}
            alt={session.name}
            fill
            sizes="(min-width: 672px) 672px, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{activityTitle}</h1>
        {session.location && <p className="text-muted-foreground text-sm">{session.location}</p>}
      </div>

      {session.location && (
        <div className="aspect-video w-full overflow-hidden rounded-lg border">
          <iframe
            title="活動地點地圖"
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=${encodeURIComponent(session.location)}&output=embed`}
          />
        </div>
      )}

      {session.intro_content && <RichContent html={session.intro_content} />}

      {session.schedule_content && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">流程表</CardTitle>
          </CardHeader>
          <CardContent>
            <RichContent html={session.schedule_content} />
          </CardContent>
        </Card>
      )}

      {session.registration_process_content && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">報名流程說明</CardTitle>
          </CardHeader>
          <CardContent>
            <RichContent html={session.registration_process_content} />
          </CardContent>
        </Card>
      )}

      {session.fee_waiver_content && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">減免內容及應附文件</CardTitle>
          </CardHeader>
          <CardContent>
            <RichContent html={session.fee_waiver_content} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">活動辦法/注意事項</CardTitle>
        </CardHeader>
        <CardContent>
          <RichContent html={session.rules_text || DEFAULT_RULES_TEXT} />
        </CardContent>
      </Card>
    </>
  );

  if (!agreedToTerms) {
    return (
      <div className="mx-auto grid max-w-2xl gap-6">
        {introContent}
        <ConsentGate
          activityTitle={activityTitle}
          gateTemplate={session.consent_gate_text}
          onAgree={() => setAgreedToTerms(true)}
        />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto grid max-w-2xl gap-6">
        {introContent}

        <ProgressDots
          sections={[
            { label: "聯絡資訊", done: !!contactEmail },
            ...(watchedMembers ?? []).map((m, i) => ({
              label: i === 0 ? "聯絡人資料" : `成員 ${i + 1}`,
              done: !!m?.name && !!m?.id_number,
            })),
            { label: "同意事項", done: !!agreeRules && !!agreePrivacy },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">聯絡資訊</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>聯絡 Email（必填）</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>聯絡電話（必填）</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {fields.map((field, index) => (
          <MemberFieldGroup
            key={field.id}
            control={form.control}
            setValue={form.setValue}
            index={index}
            sessionId={session.id}
            identityTypes={identityTypes}
            feeCategories={feeCategories}
            removable={index > 0}
            onRemove={() => remove(index)}
          />
        ))}

        {fields.length < session.max_members_per_registration && (
          <Button type="button" variant="outline" onClick={() => append(emptyMember())}>
            + 新增成員
          </Button>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">注意事項與同意書</CardTitle>
          </CardHeader>
          <CardContent>
            <ConsentSection
              control={form.control}
              rulesText={session.rules_text || DEFAULT_RULES_TEXT}
              privacyConsentText={session.privacy_consent_text}
            />
          </CardContent>
        </Card>

        {session.submit_reminder_text && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">送出前請注意</CardTitle>
            </CardHeader>
            <CardContent>
              <RichContent html={session.submit_reminder_text} />
            </CardContent>
          </Card>
        )}

        {submitError && <p className="text-destructive text-sm">{submitError}</p>}

        <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
          {form.formState.isSubmitting ? "送出中..." : "送出報名"}
        </Button>
      </form>
    </Form>
  );
}
