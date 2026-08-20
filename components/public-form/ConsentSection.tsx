"use client";

import { useEffect, useRef, useState } from "react";
import type { Control } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RichContent } from "@/components/public-form/RichContent";
import { withFallback } from "@/lib/contentHtml";
import type { RegistrationFormInput } from "@/lib/validation/registration-schema";

const DEFAULT_PRIVACY_CONSENT_TEXT = `本活動蒐集之個人資料（含身分證字號、聯絡方式、戶籍地址等）僅用於本次活動報名、審核、繳費、通知及相關行政作業，不作其他用途，亦不會提供第三方使用。`;

// Requires the registrant to actually scroll a text block to (near) its bottom
// before the corresponding checkbox unlocks — a box short enough to need no
// scrolling counts as already read.
function ScrollGatedText({ html, onRead }: { html: string; onRead: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) {
      setRead(true);
      onRead();
    }
    // Only checked once on mount — this is about whether the box needed scrolling
    // in the first place, not something that should re-run as content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    if (read) return;
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) {
      setRead(true);
      onRead();
    }
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="bg-muted/40 max-h-48 overflow-y-auto rounded-lg border p-3"
      >
        <RichContent html={html} />
      </div>
      {!read && (
        <div className="from-muted/90 text-muted-foreground pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-end justify-center rounded-b-lg bg-gradient-to-t to-transparent pb-1 text-xs">
          ↓ 請滑到底部閱讀完整內容
        </div>
      )}
    </div>
  );
}

export function ConsentSection({
  control,
  rulesText,
  privacyConsentText,
}: {
  control: Control<RegistrationFormInput>;
  rulesText: string;
  privacyConsentText?: string | null;
}) {
  const [rulesRead, setRulesRead] = useState(false);
  const [privacyRead, setPrivacyRead] = useState(false);

  return (
    <div className="grid gap-4">
      <ScrollGatedText html={rulesText} onRead={() => setRulesRead(true)} />
      <FormField
        control={control}
        name="agree_rules"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox
                checked={field.value}
                disabled={!rulesRead}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <FormLabel className="font-normal">
              已詳讀並同意活動辦法/注意事項
              {!rulesRead && <span className="text-muted-foreground">（請先閱讀上方內容）</span>}
            </FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />

      <ScrollGatedText
        html={withFallback(privacyConsentText, DEFAULT_PRIVACY_CONSENT_TEXT)}
        onRead={() => setPrivacyRead(true)}
      />
      <FormField
        control={control}
        name="agree_privacy"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2">
            <FormControl>
              <Checkbox
                checked={field.value}
                disabled={!privacyRead}
                onCheckedChange={field.onChange}
              />
            </FormControl>
            <FormLabel className="font-normal">
              同意個資蒐集告知事項
              {!privacyRead && <span className="text-muted-foreground">（請先閱讀上方內容）</span>}
            </FormLabel>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
