"use client";

import { useActionState } from "react";
import {
  updateMemberFeeReview,
  type ActionState,
} from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { FileViewLink } from "@/components/admin/FileViewLink";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";

const initialState: ActionState = { error: null };

export function MemberReviewRow({
  sessionId,
  registrationId,
  canEdit,
  member,
  idNumber,
  identityTypeName,
  feeCategoryLabel,
  files,
}: {
  sessionId: string;
  registrationId: string;
  canEdit: boolean;
  member: {
    id: string;
    name: string;
    household_address: string | null;
    birth_year_roc: number | null;
    gender: string | null;
    org_selected: string | null;
    org_other_text: string | null;
    fee_review_result: string;
  };
  idNumber: string | null;
  identityTypeName: string | null;
  feeCategoryLabel: string | null;
  files: { id: string; file_type: string }[];
}) {
  const action = updateMemberFeeReview.bind(null, sessionId, registrationId, member.id);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{member.name}</div>
        <div className="text-muted-foreground text-sm">{idNumber ?? "（無法顯示）"}</div>
      </TableCell>
      <TableCell>
        <div>{identityTypeName ?? "-"}</div>
        {member.org_selected && (
          <div className="text-muted-foreground text-sm">
            {member.org_selected}
            {member.org_other_text ? `（${member.org_other_text}）` : ""}
          </div>
        )}
      </TableCell>
      <TableCell>{feeCategoryLabel ?? "未申請"}</TableCell>
      <TableCell>
        {canEdit ? (
          <form action={formAction} className="flex items-center gap-2">
            <select
              name="fee_review_result"
              defaultValue={member.fee_review_result}
              className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
            >
              <option value="審核中">審核中</option>
              <option value="審核通過">審核通過</option>
              <option value="需繳費">需繳費</option>
              <option value="無需繳費">無需繳費</option>
            </select>
            <SubmitButton>更新</SubmitButton>
          </form>
        ) : (
          <span>{member.fee_review_result}</span>
        )}
        {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {files.map((f) => (
            <FileViewLink key={f.id} fileId={f.id} label={f.file_type} />
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}
