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

export function buildReviewResultEmail(input: ReviewResultEmailInput): {
  subject: string;
  body: string;
} {
  const admissionLine =
    input.admissionStatus === "正取"
      ? "您已錄取本次活動（正取）。"
      : input.admissionStatus === "備取"
        ? `您目前為備取名單，備取順位第 ${input.waitlistRank ?? "-"} 位，若有名額釋出將另行通知。`
        : "審核結果請見以下說明。";

  const memberLines = input.members.map(describeMember).join("\n");

  let paymentLines = "無需繳費。";
  if (input.paymentAmount > 0) {
    if (input.paymentMethod === "online" && input.ecpayLink) {
      paymentLines = `應繳金額：${input.paymentAmount} 元\n請於期限內完成線上繳費：${input.ecpayLink}`;
    } else if (input.paymentMethod === "manual") {
      paymentLines = `應繳金額：${input.paymentAmount} 元\n${input.manualTransferAccountInfo}\n轉帳完成後請回報帳號後五碼。`;
    } else {
      paymentLines = `應繳金額：${input.paymentAmount} 元，繳費方式將另行通知。`;
    }
  }

  const subject = `【${input.sessionName}】報名審核結果通知`;
  const body = `${admissionLine}

活動場次：${input.sessionName}

成員審核結果：
${memberLines}

繳費資訊：
${paymentLines}
`;

  return { subject, body };
}
