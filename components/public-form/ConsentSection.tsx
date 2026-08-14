"use client";

import type { Control } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RichContent } from "@/components/public-form/RichContent";
import type { RegistrationFormInput } from "@/lib/validation/registration-schema";

const DEFAULT_PRIVACY_CONSENT_TEXT = `本活動蒐集之個人資料（含身分證字號、聯絡方式、戶籍地址等）僅用於本次活動報名、審核、繳費、通知及相關行政作業，不作其他用途，亦不會提供第三方使用。`;

export function ConsentSection({
  control,
  rulesText,
  privacyConsentText,
}: {
  control: Control<RegistrationFormInput>;
  rulesText: string;
  privacyConsentText?: string | null;
}) {
  return (
    <div className="grid gap-4">
      <div className="bg-muted/40 max-h-48 overflow-y-auto rounded-lg border p-3">
        <RichContent html={rulesText} />
      </div>
      <FormField
        control={control}
        name="agree_rules"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="font-normal">已詳讀並同意活動辦法/注意事項</FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="bg-muted/40 max-h-48 overflow-y-auto rounded-lg border p-3">
        <RichContent html={privacyConsentText || DEFAULT_PRIVACY_CONSENT_TEXT} />
      </div>
      <FormField
        control={control}
        name="agree_privacy"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="font-normal">同意個資蒐集告知事項</FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
