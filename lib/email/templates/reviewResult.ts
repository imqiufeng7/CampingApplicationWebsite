import type { AdmissionStatus, EmailType, PaymentMethod } from "@/lib/db/types";
import { formatSessionDateWithWeekday, formatDeadlineRocWithWeekday } from "@/lib/timezone";

// 正取/備取 get independently-editable templates (see
// supabase/migrations/20260820110001_split_review_result_templates.sql) — this picks
// which one applies. Only ever called for 正取/備取 rows in practice (send-results and
// sendPaymentNotice both filter to those two statuses beforehand); anything else
// falls back to the 正取 template rather than crashing.
export function reviewResultEmailType(admissionStatus: AdmissionStatus): EmailType {
  return admissionStatus === "備取" ? "審核結果-備取" : "審核結果-正取";
}

export interface ReviewResultMemberInfo {
  name: string;
  feeReviewResult: string;
  feeCategoryLabel: string | null;
}

export interface ReviewResultEmailInput {
  sessionName: string;
  sessionDateStart: string | null;
  sessionDateEnd: string | null;
  admissionStatus: AdmissionStatus;
  waitlistRank: number | null;
  members: ReviewResultMemberInfo[];
  // Flat per-paying-member fee (event_sessions.fee_discount_per_person) — the same
  // figure fn_recompute_registration_payment multiplies by the paying-member count to
  // get registrations.payment_amount, so summing each member's own amount here always
  // matches paymentAmount below.
  feeDiscountPerPerson: number;
  paymentAmount: number;
  paymentMethod: PaymentMethod | null;
  paymentDeadline: string | null;
  ecpayLink: string | null;
  manualTransferAccountInfo: string;
}

// Shared across the batch send-results route and the single-registration payment
// notice resend, so the two paths never drift.
export const MANUAL_TRANSFER_ACCOUNT_INFO =
  "轉帳帳號：合作金庫銀行 (006) 1234-567-890123，戶名：OO活動籌備會";

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

// 系統自動組成逐人結果描述文字，第一位成員標示為「聯絡人(成員1)」，其餘依序「成員2」
// 「成員3」...。付費與否採跟 fn_recompute_registration_payment 一致的二分法——
// fee_review_result 是「無需繳費」才算免繳，其餘（需繳費／審核中等）一律視為需繳交這
// 筆固定金額，兩者才不會兜不起來。
function describeMember(m: ReviewResultMemberInfo, index: number, feeDiscountPerPerson: number): string {
  const label = index === 0 ? "聯絡人(成員1)" : `成員${index + 1}`;
  if (!m.feeCategoryLabel) {
    return `${label}：${m.name}，未申請免付費申請資格，需繳報名費${feeDiscountPerPerson}元`;
  }
  if (m.feeReviewResult === "無需繳費") {
    return `${label}：${m.name}，符合${m.feeCategoryLabel}申請資格，無需繳交報名費`;
  }
  return `${label}：${m.name}，未符合${m.feeCategoryLabel}申請資格，需繳報名費${feeDiscountPerPerson}元`;
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

  const memberLines = input.members
    .map((m, i) => describeMember(m, i, input.feeDiscountPerPerson))
    .join("\n");
  // Only appended when someone actually owes money — every member's own line above
  // already reads "無需繳交報名費" when the total is zero, so a "共計 0 元" line here
  // would just be redundant.
  const memberSection =
    input.paymentAmount > 0
      ? `${memberLines}\n您需要繳交的團隊報名費共計${input.paymentAmount}元。`
      : memberLines;

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
    const deadlineLine = input.paymentDeadline
      ? `\n繳費期限：${formatDeadlineRocWithWeekday(input.paymentDeadline)} 前`
      : "";
    if (input.paymentMethod === "online" && input.ecpayLink) {
      paymentLines = `繳費連結：${input.ecpayLink}${deadlineLine}`;
    } else if (input.paymentMethod === "manual") {
      paymentLines = `${input.manualTransferAccountInfo}\n轉帳完成後請回報帳號後五碼。${deadlineLine}`;
    } else {
      paymentLines = `繳費方式將另行通知。${deadlineLine}`;
    }
  } else {
    paymentLines = "無需繳費。";
  }

  return {
    活動名稱: input.sessionName,
    活動日期: formatSessionDateWithWeekday(input.sessionDateStart, input.sessionDateEnd),
    第一位成員姓名: input.members[0]?.name ?? "",
    錄取結果: admissionLine,
    成員審核結果: memberSection,
    繳費資訊: paymentLines,
  };
}
