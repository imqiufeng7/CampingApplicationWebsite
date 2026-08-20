export interface AdminInviteEmailInput {
  roleLabel: string;
  setupUrl: string;
}

// Fallback only — matches the row seeded by the email_templates migration, used if
// that row was somehow deleted (getGlobalEmailTemplate's last resort).
export const DEFAULT_ADMIN_INVITE_SUBJECT = "【報名系統後台】您已受邀加入管理團隊";
export const DEFAULT_ADMIN_INVITE_BODY = `您好，

您已被邀請加入報名系統後台，角色為「{{角色}}」。

請點擊以下連結設定登入密碼並開始使用：
{{設定連結}}

請妥善保存此連結，勿轉發給他人。若非本人申請，請忽略此信。
`;

export function buildAdminInviteVars(input: AdminInviteEmailInput): Record<string, string> {
  return {
    角色: input.roleLabel,
    設定連結: input.setupUrl,
  };
}
