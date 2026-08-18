"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  updateMemberFeeReview,
  updateMemberResubmission,
  sendResubmissionNotice,
  type ActionState,
} from "@/app/admin/(protected)/registrations/[sessionId]/[registrationId]/actions";
import { getMemberIdNumbersForRegistration } from "@/app/admin/(protected)/reviews/[sessionId]/actions";

type MemberInfo = {
  id: string;
  name: string;
  identity_type_id: string | null;
  org_selected: string | null;
  org_other_text: string | null;
  fee_category_id: string | null;
  fee_review_result: string;
  needs_resubmission: boolean;
  resubmission_note: string | null;
  birth_year_roc: number | null;
  birth_month: number | null;
  birth_day: number | null;
};

// 足歲 (actual/full age): counts down until this year's birthday has passed, not just
// current-year minus birth-year. ROC year + 1911 = Gregorian year.
function calcAge(rocYear: number | null, month: number | null, day: number | null): number | null {
  if (!rocYear) return null;
  const birthYear = rocYear + 1911;
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (month && day) {
    const thisYearBirthdayPassed =
      now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
    if (!thisYearBirthdayPassed) age -= 1;
  }
  return age;
}

function formatBirthDate(rocYear: number | null, month: number | null, day: number | null): string {
  if (!rocYear) return "-";
  return `民國 ${rocYear} 年${month ? ` ${month} 月` : ""}${day ? ` ${day} 日` : ""}`;
}

type FileInfo = { id: string; member_id: string | null; file_type: string };

const initialState: ActionState = { error: null };

function MemberFeeReviewForm({
  sessionId,
  registrationId,
  member,
  canEdit,
}: {
  sessionId: string;
  registrationId: string;
  member: MemberInfo;
  canEdit: boolean;
}) {
  const action = updateMemberFeeReview.bind(null, sessionId, registrationId, member.id);
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  if (!canEdit) {
    return <span className="text-sm">{member.fee_review_result}</span>;
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="fee_review_result"
        defaultValue={member.fee_review_result}
        className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
      >
        <option value="審核中">審核中</option>
        <option value="需繳費">需繳費</option>
        <option value="無需繳費">無需繳費</option>
      </select>
      <SubmitButton>更新</SubmitButton>
    </form>
  );
}

// Per-member 退回補件: lives here (not the review-table overview) because a document
// problem is specific to the person whose file it is — different members in the same
// registration can each have their own reason.
function MemberResubmissionForm({
  sessionId,
  registrationId,
  member,
  canEdit,
}: {
  sessionId: string;
  registrationId: string;
  member: MemberInfo;
  canEdit: boolean;
}) {
  const [checked, setChecked] = useState(member.needs_resubmission);
  const [note, setNote] = useState(member.resubmission_note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateMemberResubmission(sessionId, registrationId, member.id, checked, note);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已更新補件狀態");
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) {
    return member.needs_resubmission ? (
      <p className="text-destructive text-sm">需補件：{member.resubmission_note}</p>
    ) : null;
  }

  return (
    <div className="grid gap-2 rounded-lg border border-destructive/30 p-2.5">
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(Boolean(v))} />
        <span className="text-sm font-medium">此成員需要補件</span>
      </div>
      {checked && (
        <Textarea
          placeholder="請填寫需補件原因，例如：證件照片模糊，請重新上傳"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="text-sm"
        />
      )}
      <div>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleSave}>
          {saving ? "儲存中..." : "更新補件狀態"}
        </Button>
      </div>
    </div>
  );
}

// Fetching and file-index state live here, keyed by member id from the parent
// (`key={selectedMember.id}`) so switching members remounts this component and
// resets both pieces of state naturally, instead of resetting them from an effect.
function MemberPanel({
  sessionId,
  registrationId,
  member,
  memberFiles,
  idNumber,
  identityTypeMap,
  feeCategoryMap,
  canEdit,
}: {
  sessionId: string;
  registrationId: string;
  member: MemberInfo;
  memberFiles: FileInfo[];
  idNumber: string | null | undefined;
  identityTypeMap: Map<string, string>;
  feeCategoryMap: Map<string, string>;
  canEdit: boolean;
}) {
  const [fileIndex, setFileIndex] = useState(0);
  const [urlEntry, setUrlEntry] = useState<{ fileId: string; url: string } | null>(null);
  const currentFile = memberFiles[fileIndex];
  const signedUrl = urlEntry && currentFile && urlEntry.fileId === currentFile.id ? urlEntry.url : null;

  useEffect(() => {
    if (!currentFile) return;
    let cancelled = false;
    fetch(`/api/files/${currentFile.id}/signed-url`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.url) setUrlEntry({ fileId: currentFile.id, url: json.url });
      });
    return () => {
      cancelled = true;
    };
  }, [currentFile]);

  return (
    <div className="grid gap-3">
      <div className="text-sm">
        <div className="font-medium">{member.name}</div>
        <div className="text-muted-foreground">{idNumber ?? "讀取中..."}</div>
        <div className="text-muted-foreground">
          {formatBirthDate(member.birth_year_roc, member.birth_month, member.birth_day)}
          {(() => {
            const age = calcAge(member.birth_year_roc, member.birth_month, member.birth_day);
            return age != null ? `（足歲 ${age} 歲）` : "";
          })()}
        </div>
        <div className="text-muted-foreground">
          {member.identity_type_id ? (identityTypeMap.get(member.identity_type_id) ?? "-") : "-"}
          {member.org_selected && ` · ${member.org_selected}`}
          {member.org_other_text && `（${member.org_other_text}）`}
        </div>
        <div className="text-muted-foreground">
          申請類別：
          {member.fee_category_id ? (feeCategoryMap.get(member.fee_category_id) ?? "-") : "未申請"}
        </div>
      </div>

      <div className="bg-muted/30 grid min-h-64 place-items-center rounded-lg border">
        {memberFiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">未上傳文件</p>
        ) : signedUrl ? (
          <iframe src={signedUrl} className="h-64 w-full rounded-lg" title={currentFile?.file_type} />
        ) : (
          <p className="text-muted-foreground text-sm">載入中...</p>
        )}
      </div>

      {memberFiles.length > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fileIndex === 0}
            onClick={() => setFileIndex((i) => i - 1)}
          >
            ← 上一份
          </Button>
          <span className="text-muted-foreground">
            {currentFile?.file_type}（{fileIndex + 1} / {memberFiles.length}）
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fileIndex >= memberFiles.length - 1}
            onClick={() => setFileIndex((i) => i + 1)}
          >
            下一份 →
          </Button>
        </div>
      )}
      {memberFiles.length === 1 && (
        <p className="text-muted-foreground text-center text-sm">{currentFile?.file_type}</p>
      )}

      {signedUrl && (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-center text-sm underline"
        >
          在新分頁開啟
        </a>
      )}

      <div className="border-t pt-3">
        <p className="text-muted-foreground mb-1 text-sm">減免審核結果</p>
        <MemberFeeReviewForm
          sessionId={sessionId}
          registrationId={registrationId}
          member={member}
          canEdit={canEdit}
        />
      </div>

      <MemberResubmissionForm
        sessionId={sessionId}
        registrationId={registrationId}
        member={member}
        canEdit={canEdit}
      />
    </div>
  );
}

export function MemberDocumentsDialog({
  sessionId,
  registrationId,
  members,
  files,
  identityTypeMap,
  feeCategoryMap,
  canEdit,
}: {
  sessionId: string;
  registrationId: string;
  members: MemberInfo[];
  files: FileInfo[];
  identityTypeMap: Map<string, string>;
  feeCategoryMap: Map<string, string>;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [idNumbers, setIdNumbers] = useState<Map<string, string | null>>(new Map());
  const [sending, setSending] = useState(false);

  const filesByMember = useMemo(() => {
    const map = new Map<string, FileInfo[]>();
    for (const f of files) {
      if (!f.member_id) continue;
      const list = map.get(f.member_id) ?? [];
      list.push(f);
      map.set(f.member_id, list);
    }
    return map;
  }, [files]);

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const memberFiles = selectedMemberId ? (filesByMember.get(selectedMemberId) ?? []) : [];
  const flaggedCount = members.filter((m) => m.needs_resubmission).length;

  useEffect(() => {
    if (!open) return;
    getMemberIdNumbersForRegistration(
      sessionId,
      registrationId,
      members.map((m) => m.id)
    ).then((results) => {
      setIdNumbers(new Map(results.map((r) => [r.memberId, r.idNumber])));
    });
  }, [open, sessionId, registrationId, members]);

  async function handleSendNotice() {
    setSending(true);
    try {
      const result = await sendResubmissionNotice(sessionId, registrationId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("已寄送補件通知");
    } finally {
      setSending(false);
    }
  }

  const totalFileCount = files.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setSelectedMemberId(members[0]?.id ?? null);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            {`📎 ${totalFileCount} 份文件`}
          </Button>
        }
      />
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>證明文件與減免審核</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[160px_1fr] gap-4">
          <div className="grid gap-1 border-r pr-3">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMemberId(m.id)}
                className={
                  m.id === selectedMemberId
                    ? "bg-primary text-primary-foreground rounded-lg px-2 py-1.5 text-left text-sm font-medium shadow-sm"
                    : "hover:bg-muted text-foreground rounded-lg border border-transparent px-2 py-1.5 text-left text-sm"
                }
              >
                {m.name}
                {m.needs_resubmission && <span className="ml-1">🚩</span>}
                <span className="text-muted-foreground ml-1 text-xs">
                  ({(filesByMember.get(m.id) ?? []).length})
                </span>
              </button>
            ))}
          </div>

          {selectedMember && (
            <MemberPanel
              key={selectedMember.id}
              sessionId={sessionId}
              registrationId={registrationId}
              member={selectedMember}
              memberFiles={memberFiles}
              idNumber={idNumbers.get(selectedMember.id)}
              identityTypeMap={identityTypeMap}
              feeCategoryMap={feeCategoryMap}
              canEdit={canEdit}
            />
          )}
        </div>

        {canEdit && flaggedCount > 0 && (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-muted-foreground text-sm">目前有 {flaggedCount} 位成員被標記需補件</p>
            <Button type="button" size="sm" disabled={sending} onClick={handleSendNotice}>
              {sending ? "寄送中..." : "寄送補件通知"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
