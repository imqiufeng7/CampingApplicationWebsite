"use client";

import type { Control } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionCard } from "@/components/public-form/SectionCard";
import type { RegistrationFormInput } from "@/lib/validation/registration-schema";

// External jingsi.org URLs, not local/optimizable assets, so plain <img> is used
// below instead of next/image (which would need a remotePatterns allowlist entry).
const BED_REFERENCE_IMAGES = [
  "https://www.jingsi.org/images/product/story2/bed_a1.png",
  "https://www.jingsi.org/images/product/story2/bed_a2.png",
  "https://www.jingsi.org/images/product/story2/bed_a3.png",
  "https://www.jingsi.org/images/product/story2/bed_a4.png",
];

export function ComfortBedField({ control }: { control: Control<RegistrationFormInput> }) {
  return (
    <SectionCard title="「淨斯福慧床」借用需求" contentClassName="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BED_REFERENCE_IMAGES.map((src) => (
          <div key={src} className="bg-card overflow-hidden rounded-lg border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="淨斯福慧床參考圖" className="aspect-square w-full object-contain" />
          </div>
        ))}
      </div>

      <div className="text-muted-foreground grid gap-2 text-sm">
        <p>
          本活動提供「淨斯福慧床」供夜宿體驗使用。福慧床可完全攤平為單人床，亦可半折轉換為座椅或長椅，方便帳內空間靈活運用。（參考網址：
          <a
            href="https://www.jingsi.org/?view=article&id=885&catid=31"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            https://www.jingsi.org/?view=article&id=885&catid=31
          </a>
          ）
        </p>
        <p>考量帳篷內部空間，4人同帳擺放床型會較緊湊，建議2–3人入住者借用體驗較佳，請自行評估。</p>
      </div>

      <FormField
        control={control}
        name="comfort_bed_needed"
        render={({ field }) => (
          <FormItem>
            <FormLabel>是否需要借用福慧床（必填）</FormLabel>
            <FormControl>
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-base">
                  <input
                    type="radio"
                    name={field.name}
                    checked={field.value === "需要"}
                    onChange={() => field.onChange("需要")}
                    className="accent-primary size-6"
                  />
                  需要借用（1張）
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-base">
                  <input
                    type="radio"
                    name={field.name}
                    checked={field.value === "不需要"}
                    onChange={() => field.onChange("不需要")}
                    className="accent-primary size-6"
                  />
                  不需要借用
                </label>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </SectionCard>
  );
}
