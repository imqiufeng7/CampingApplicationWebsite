"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  upsertSessionEmailTemplate,
  deleteSessionEmailTemplate,
  type ActionState,
} from "@/app/admin/(protected)/series/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { EmailType } from "@/lib/db/types";

const initialState: ActionState = { error: null };

type TemplateText = { subject_template: string; body_template: string };

export function SessionEmailTemplateEditor({
  seriesId,
  sessionId,
  type,
  label,
  placeholders,
  override,
  globalDefault,
}: {
  seriesId: string;
  sessionId: string;
  type: EmailType;
  label: string;
  placeholders: string[];
  override: TemplateText | null;
  globalDefault: TemplateText;
}) {
  const [editing, setEditing] = useState(!!override);
  const [deleting, setDeleting] = useState(false);
  const action = upsertSessionEmailTemplate.bind(null, seriesId, sessionId, type);
  const [state, formAction] = useActionState(action, initialState);

  async function handleRevert() {
    setDeleting(true);
    const result = await deleteSessionEmailTemplate(seriesId, sessionId, type);
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEditing(false);
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {override ? (
          <Badge variant="secondary">此場次自訂</Badge>
        ) : (
          <Badge variant="outline">使用全域預設</Badge>
        )}
      </div>

      {!editing ? (
        <>
          <div className="text-muted-foreground grid gap-1 text-sm">
            <p className="font-medium">{globalDefault.subject_template}</p>
            <p className="line-clamp-3 whitespace-pre-wrap">{globalDefault.body_template}</p>
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              自訂此場次內容
            </Button>
          </div>
        </>
      ) : (
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`s-subject-${type}`}>主旨</Label>
            <Input
              id={`s-subject-${type}`}
              name="subject_template"
              defaultValue={override?.subject_template ?? globalDefault.subject_template}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`s-body-${type}`}>內文</Label>
            <Textarea
              id={`s-body-${type}`}
              name="body_template"
              defaultValue={override?.body_template ?? globalDefault.body_template}
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
          <div className="flex items-center gap-2">
            <SubmitButton>儲存此場次內容</SubmitButton>
            {override ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={deleting}
                onClick={handleRevert}
              >
                改回使用全域預設
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                取消
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
