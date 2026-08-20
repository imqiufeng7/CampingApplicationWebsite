"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RichContent } from "@/components/public-form/RichContent";
import { SectionCard } from "@/components/public-form/SectionCard";
import { withFallback } from "@/lib/contentHtml";

const DEFAULT_GATE_TEMPLATE = `若您同意本頁相關條款，則請點選本頁頁末之「同意」按鈕，即可進行後續的報名程序，若您不同意本頁相關條款，則無法報名參加。
凡於本網站登錄資料者，均視為已同意本頁所有規定，本網站內其他說明若與本頁抵觸者，則均以本頁說明為準。
請申請人詳閱活動辦法及注意事項，並告知所有成員。
我已經詳讀並且同意「{{活動名稱}}」活動辦法。`;

function renderGateText(template: string, activityTitle: string): string {
  return template.replaceAll("{{活動名稱}}", activityTitle);
}

export function ConsentGate({
  activityTitle,
  gateTemplate,
  onAgree,
}: {
  activityTitle: string;
  gateTemplate?: string | null;
  onAgree: () => void;
}) {
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <SectionCard title="報名須知與同意條款" contentClassName="py-8 text-center">
        <p>您已選擇不同意本頁條款，無法進行報名。</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="報名須知與同意條款" delay={240} contentClassName="grid gap-4">
      <RichContent html={renderGateText(withFallback(gateTemplate, DEFAULT_GATE_TEMPLATE), activityTitle)} />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="lg"
          className="animate-pulse-cta rounded-full px-6 font-bold"
          onClick={onAgree}
        >
          我同意，開始報名
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => setDeclined(true)}>
          不同意
        </Button>
      </div>
    </SectionCard>
  );
}
