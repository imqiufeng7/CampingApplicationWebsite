"use client";

import { useActionState, useState } from "react";
import { updateEmailTemplate, type ActionState } from "@/app/admin/(protected)/email-templates/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { renderTemplate } from "@/lib/email/renderTemplate";
import type { EmailType } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function EmailTemplateEditor({
  type,
  subjectTemplate,
  bodyTemplate,
  placeholders,
  sampleVars,
}: {
  type: EmailType;
  subjectTemplate: string;
  bodyTemplate: string;
  placeholders: string[];
  sampleVars: Record<string, string>;
}) {
  const action = updateEmailTemplate.bind(null, type);
  const [state, formAction] = useActionState(action, initialState);
  const [subject, setSubject] = useState(subjectTemplate);
  const [body, setBody] = useState(bodyTemplate);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={formAction} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`subject-${type}`}>主旨</Label>
          <Input
            id={`subject-${type}`}
            name="subject_template"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`body-${type}`}>內文</Label>
          <Textarea
            id={`body-${type}`}
            name="body_template"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={10}
            className="font-mono text-sm"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          可用變數（系統會自動帶入實際內容，請勿刪除）：
          {placeholders.map((p) => `{{${p}}}`).join("、")}
        </p>
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
        <div>
          <SubmitButton>儲存</SubmitButton>
        </div>
      </form>

      <div className="bg-muted/30 grid gap-2 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs font-medium">套用範例資料後的預覽（僅供排版確認，非實際寄送內容）</p>
        <div className="bg-card rounded-md border p-3 text-sm">
          <p className="mb-2 font-medium">{renderTemplate(subject, sampleVars)}</p>
          <p className="text-muted-foreground whitespace-pre-wrap">{renderTemplate(body, sampleVars)}</p>
        </div>
      </div>
    </div>
  );
}
