"use client";

import { useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createClient } from "@/lib/supabase/client";
import {
  buildRegistrationSchema,
  resolveIdentityTypeId,
  type RegistrationFormInput,
  type RegistrationFormOutput,
} from "@/lib/validation/registration-schema";
import type { Database } from "@/lib/db/types";
import type { EditRegistrationData } from "@/lib/editRegistrationTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MemberFieldGroup } from "@/components/public-form/MemberFieldGroup";

type EventSession = Database["public"]["Tables"]["event_sessions"]["Row"];
type IdentityType = Database["public"]["Tables"]["session_identity_types"]["Row"];
type FeeCategory = Database["public"]["Tables"]["session_fee_categories"]["Row"];

export function EditRegistrationForm({
  token,
  session,
  identityTypes,
  feeCategories,
  data,
}: {
  token: string;
  session: EventSession;
  identityTypes: IdentityType[];
  feeCategories: FeeCategory[];
  data: EditRegistrationData;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const schema = useMemo(
    () =>
      buildRegistrationSchema({
        maxMembers: data.members.length,
        identityTypes,
        feeCategories,
      }),
    [data.members.length, identityTypes, feeCategories]
  );

  const form = useForm<RegistrationFormInput, unknown, RegistrationFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      members: data.members.map((m) => {
        const identityType = identityTypes.find((it) => it.id === m.identity_type_id);
        return {
          name: m.name,
          id_number: m.id_number ?? "",
          household_address: m.household_address ?? "",
          birth_year_roc: (m.birth_year_roc ?? "") as unknown as number,
          birth_month: (m.birth_month ?? "") as unknown as number,
          birth_day: (m.birth_day ?? "") as unknown as number,
          gender: (m.gender ?? "") as unknown as "男" | "女" | "跨性別",
          is_staff: identityType?.requires_org_field ?? false,
          org_selected: m.org_selected ?? "",
          org_other_text: m.org_other_text ?? "",
          fee_category_id: m.fee_category_id ?? "",
          files: m.files.map((f) => ({ file_type: f.file_type, storage_path: f.storage_path })),
        };
      }),
      agree_rules: true,
      agree_privacy: true,
    },
    mode: "onBlur",
  });

  const { fields } = useFieldArray({ control: form.control, name: "members" });

  async function onSubmit(values: RegistrationFormOutput) {
    setSubmitError(null);
    const supabase = createClient();

    const { error } = await supabase.rpc("fn_update_registration_via_token", {
      p_token: token,
      payload: {
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
      setSubmitError(error.message ?? "更新失敗，請稍後再試");
      return;
    }

    setSaved(true);
  }

  if (saved) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>資料已更新</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>您的報名資料（編號 {data.registration_no}）已更新完成，感謝配合。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mx-auto grid max-w-2xl gap-6">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">修改報名資料</h1>
          <p className="text-muted-foreground text-sm">
            {session.name} · 報名編號 {data.registration_no}
          </p>
        </div>

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
            removable={false}
            onRemove={() => {}}
          />
        ))}

        {submitError && <p className="text-destructive text-sm">{submitError}</p>}

        <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
          {form.formState.isSubmitting ? "儲存中..." : "儲存修改"}
        </Button>
      </form>
    </Form>
  );
}
