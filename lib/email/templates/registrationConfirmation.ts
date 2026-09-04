export interface RegistrationConfirmationMemberInfo {
  name: string;
}

export interface RegistrationConfirmationEmailInput {
  sessionName: string;
  registrationNo: string;
  contactEmail: string;
  contactPhone: string;
  members: RegistrationConfirmationMemberInfo[];
  lookupUrl: string;
}

// Fallback only — matches the row seeded by the email_templates migration, used if
// that row was somehow deleted (getEmailTemplate's last resort).
export const DEFAULT_REGISTRATION_CONFIRMATION_SUBJECT =
  "【{{活動名稱}}】報名資料確認（編號 {{報名編號}}）";
// No modify-your-own-data link here on purpose — every registration starts locked
// (remaining_self_edits = 0) and only ever opens for a single save at the moment
// staff actually decide it's needed (退回補件, or a manual "允許再修改一次"), so a link
// included here would just be dead until then.
export const DEFAULT_REGISTRATION_CONFIRMATION_BODY = `{{第一位成員姓名}} 您好，以下是您的報名資料副本：

活動場次：{{活動名稱}}
報名編號：{{報名編號}}
聯絡 Email：{{聯絡Email}}
聯絡電話：{{聯絡電話}}

成員名單：
{{成員名單}}

如發現資料有誤，請洽詢主辦單位協助修改。

審核結果公布後，可至以下連結查詢：
{{查詢連結}}

如有任何疑問，請洽詢主辦單位。
`;

// System-computed values the vendor-editable template text can't express (a list
// built from live registration data, a generated link) — filled into
// {{placeholder}} tokens via renderTemplate, everything else in the template stays
// freely editable prose.
export function buildRegistrationConfirmationVars(
  input: RegistrationConfirmationEmailInput
): Record<string, string> {
  return {
    活動名稱: input.sessionName,
    報名編號: input.registrationNo,
    聯絡Email: input.contactEmail,
    聯絡電話: input.contactPhone,
    第一位成員姓名: input.members[0]?.name ?? "",
    成員名單: input.members.map((m, i) => `${i + 1}. ${m.name}`).join("\n"),
    查詢連結: input.lookupUrl,
  };
}
