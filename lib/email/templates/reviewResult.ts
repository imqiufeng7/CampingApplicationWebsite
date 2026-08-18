import type { AdmissionStatus, PaymentMethod } from "@/lib/db/types";

export interface ReviewResultMemberInfo {
  name: string;
  feeReviewResult: string;
  feeCategoryLabel: string | null;
}

export interface ReviewResultEmailInput {
  sessionName: string;
  admissionStatus: AdmissionStatus;
  waitlistRank: number | null;
  members: ReviewResultMemberInfo[];
  paymentAmount: number;
  paymentMethod: PaymentMethod | null;
  ecpayLink: string | null;
  manualTransferAccountInfo: string;
}

// Fallback only — matches the row seeded by the email_templates migration, used if
// that row was somehow deleted (getEmailTemplate's last resort).
export const DEFAULT_REVIEW_RESULT_SUBJECT = "【{{活動名稱}}】報名審核結果通知";
export const DEFAULT_REVIEW_RESULT_BODY = `{{錄取結果}}

活動場次：{{活動名稱}}

成員審核結果：
{{成員審核結果}}

繳費資訊：
{{繳費資訊}}
`;

// 系統自動組成逐人結果描述文字，例如「OOO，符合免付費申請資格，無需繳交報名費」
function describeMember(m: ReviewResultMemberInfo): string {
  if (!m.feeCategoryLabel) {
    return `${m.name}：一般報名`;
  }
  if (m.feeReviewResult === "無需繳費") {
    return `${m.name}，符合${m.feeCategoryLabel}申請資格，無需繳交報名費`;
  }
  if (m.feeReviewResult === "需繳費") {
    return `${m.name}，${m.feeCategoryLabel}資格審核結果為需繳費`;
  }
  return `${m.name}，${m.feeCategoryLabel}資格${m.feeReviewResult}`;
}

// System-computed values the vendor-editable template text can't express (branches
// on admission/payment state, a list built from live registration data) — filled
// into {{placeholder}} tokens via renderTemplate, everything else in the template
// stays freely editable prose.
export function buildReviewResultVars(input: ReviewResultEmailInput): Record<string, string> {
  const admissionLine =
    input.admissionStatus === "正取"
      ? "您已錄取本次活動（正取）。"
      : input.admissionStatus === "備取"
        ? `您目前為備取名單，備取順位第 ${input.waitlistRank ?? "-"} 位，若有名額釋出將另行通知。`
        : "審核結果請見以下說明。";

  const memberLines = input.members.map(describeMember).join("\n");

  // 備取/取消 never get payment details — 正取 is confirmed and payment_amount is
  // meaningful right now; a waitlisted registrant's amount is only a projection for
  // if/when they get admitted later, and showing a real payment link before that
  // would prompt them to pay for a spot they don't have yet.
  let paymentLines: string;
  if (input.admissionStatus === "備取") {
    paymentLines = "目前為備取名單，暫不需要繳費。如遞補錄取，將另行通知繳費方式與期限。";
  } else if (input.admissionStatus === "取消") {
    paymentLines = "本次未錄取，無需繳費。";
  } else if (input.paymentAmount > 0) {
    if (input.paymentMethod === "online" && input.ecpayLink) {
      paymentLines = `應繳金額：${input.paymentAmount} 元\n請於期限內完成線上繳費：${input.ecpayLink}`;
    } else if (input.paymentMethod === "manual") {
      paymentLines = `應繳金額：${input.paymentAmount} 元\n${input.manualTransferAccountInfo}\n轉帳完成後請回報帳號後五碼。`;
    } else {
      paymentLines = `應繳金額：${input.paymentAmount} 元，繳費方式將另行通知。`;
    }
  } else {
    paymentLines = "無需繳費。";
  }

  return {
    活動名稱: input.sessionName,
    錄取結果: admissionLine,
    成員審核結果: memberLines,
    繳費資訊: paymentLines,
  };
}
