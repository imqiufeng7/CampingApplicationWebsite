export interface ResubmissionRequestEmailInput {
  sessionName: string;
  registrationNo: string;
  reason: string;
  editUrl: string;
}

// Fallback only — matches the row seeded by the email_templates migration, used if
// that row was somehow deleted (getEmailTemplate's last resort).
export const DEFAULT_RESUBMISSION_REQUEST_SUBJECT = "【{{活動名稱}}】報名資料需要補件";
export const DEFAULT_RESUBMISSION_REQUEST_BODY = `您好，您的報名資料經審核後，尚有部分項目需要補正：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}

需補件原因：
{{補件原因}}

請透過以下專屬連結重新上傳或修改資料：
{{修改連結}}

請妥善保存此連結，勿轉發給他人。完成補件後，我們將重新為您審核，如有任何疑問請洽詢主辦單位。
`;

export function buildResubmissionRequestVars(
  input: ResubmissionRequestEmailInput
): Record<string, string> {
  return {
    活動名稱: input.sessionName,
    報名編號: input.registrationNo,
    補件原因: input.reason,
    修改連結: input.editUrl,
  };
}
