"use client";

import { useActionState } from "react";
import { updateEmailTemplate, type ActionState } from "@/app/admin/(protected)/email-templates/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { EmailType } from "@/lib/db/types";

const initialState: ActionState = { error: null };

export function EmailTemplateEditor({
  type,
  subjectTemplate,
  bodyTemplate,
  placeholders,
}: {
  type: EmailType;
  subjectTemplate: string;
  bodyTemplate: string;
  placeholders: string[];
}) {
  const action = updateEmailTemplate.bind(null, type);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor={`subject-${type}`}>主旨</Label>
        <Input id={`subject-${type}`} name="subject_template" defaultValue={subjectTemplate} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`body-${type}`}>內文</Label>
        <Textarea
          id={`body-${type}`}
          name="body_template"
          defaultValue={bodyTemplate}
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
  );
}
