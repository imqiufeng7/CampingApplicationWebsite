export interface EditLinkGrantedEmailInput {
  sessionName: string;
  registrationNo: string;
  reason: string;
  editUrl: string;
}

// Fallback only — matches the row seeded by the email_templates migration, used if
// that row was somehow deleted (getEmailTemplate's last resort).
export const DEFAULT_EDIT_LINK_GRANTED_SUBJECT = "【{{活動名稱}}】您的報名資料已開放修改（編號 {{報名編號}}）";
export const DEFAULT_EDIT_LINK_GRANTED_BODY = `您好，

主辦單位已重新開放您報名資料的修改權限，請於下方連結完成修改（僅能存檔一次，存檔後連結將再次關閉）：
{{修改連結}}

{{開放原因}}

如有任何疑問，請洽詢主辦單位。
`;

export function buildEditLinkGrantedVars(input: EditLinkGrantedEmailInput): Record<string, string> {
  return {
    活動名稱: input.sessionName,
    報名編號: input.registrationNo,
    開放原因: input.reason,
    修改連結: input.editUrl,
  };
}
