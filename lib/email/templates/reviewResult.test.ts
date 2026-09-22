import { describe, expect, it } from "vitest";
import { buildReviewResultVars } from "@/lib/email/templates/reviewResult";

const base = {
  sessionName: "溪湖場",
  sessionDateStart: "2026-10-17",
  sessionDateEnd: "2026-10-18",
  feeDiscountPerPerson: 150,
  admissionStatus: "正取" as const,
  paymentMethod: null,
  paymentDeadline: null,
  ecpayLink: null,
  manualTransferAccountInfo: "轉帳資訊",
};

describe("buildReviewResultVars member descriptions", () => {
  it("says 無需繳交報名費 for a member waived without a fee category selected", () => {
    // Reviewer can set fee_review_result to 無需繳費 by hand without picking a
    // category (EditableSelect allows it) — the per-member text must not contradict
    // the 0-元 total this same input produces below.
    const vars = buildReviewResultVars({
      ...base,
      members: [
        { name: "蔡炘哲", feeReviewResult: "無需繳費", feeCategoryLabel: null },
        { name: "陳羿晴", feeReviewResult: "無需繳費", feeCategoryLabel: null },
      ],
      paymentAmount: 0,
    });
    expect(vars["成員審核結果"]).toBe(
      "聯絡人(成員1)：蔡炘哲，無需繳交報名費\n成員2：陳羿晴，無需繳交報名費"
    );
    expect(vars["繳費金額"]).toBe("0");
    expect(vars["繳費資訊"]).toBe("無需繳費。");
  });

  it("still credits the category when one was actually granted", () => {
    const vars = buildReviewResultVars({
      ...base,
      members: [{ name: "王小明", feeReviewResult: "無需繳費", feeCategoryLabel: "F1 設籍該場次活動鎮民" }],
      paymentAmount: 0,
    });
    expect(vars["成員審核結果"]).toBe("聯絡人(成員1)：王小明，符合F1 設籍該場次活動鎮民申請資格，無需繳交報名費");
  });

  it("still charges a member who never applied for a fee category", () => {
    const vars = buildReviewResultVars({
      ...base,
      members: [{ name: "李四", feeReviewResult: "需繳費", feeCategoryLabel: null }],
      paymentAmount: 150,
    });
    expect(vars["成員審核結果"]).toBe("聯絡人(成員1)：李四，未申請免付費申請資格，需繳報名費150元");
  });

  it("still charges a member who applied but didn't qualify", () => {
    const vars = buildReviewResultVars({
      ...base,
      members: [{ name: "張三", feeReviewResult: "需繳費", feeCategoryLabel: "F1 設籍該場次活動鎮民" }],
      paymentAmount: 150,
    });
    expect(vars["成員審核結果"]).toBe("聯絡人(成員1)：張三，未符合F1 設籍該場次活動鎮民申請資格，需繳報名費150元");
  });
});
