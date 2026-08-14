export interface RegistrationConfirmationMemberInfo {
  name: string;
}

export interface RegistrationConfirmationEmailInput {
  sessionName: string;
  registrationNo: string;
  contactEmail: string;
  contactPhone: string;
  members: RegistrationConfirmationMemberInfo[];
  editUrl: string;
}

export function buildRegistrationConfirmationEmail(input: RegistrationConfirmationEmailInput): {
  subject: string;
  body: string;
} {
  const memberLines = input.members.map((m, i) => `${i + 1}. ${m.name}`).join("\n");

  const subject = `【${input.sessionName}】報名資料確認（編號 ${input.registrationNo}）`;
  const body = `您好，以下是您的報名資料副本：

活動場次：${input.sessionName}
報名編號：${input.registrationNo}
聯絡 Email：${input.contactEmail}
聯絡電話：${input.contactPhone}

成員名單：
${memberLines}

若發現資料有誤（例如上傳的證件檔案不清楚），可透過以下專屬連結自行修改：
${input.editUrl}

請妥善保存此連結，勿轉發給他人，任何人持有此連結皆可修改您的報名資料。

如有任何疑問，請洽詢主辦單位。
`;

  return { subject, body };
}
