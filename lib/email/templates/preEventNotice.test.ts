import { describe, it, expect } from "vitest";
import {
  buildPreEventNoticeBody,
  formatSessionDateRange,
  formatTentNo,
  type PreEventNoticeInput,
} from "@/lib/email/templates/preEventNotice";

const base: PreEventNoticeInput = {
  selfPitch: true,
  leaderName: "王小玉",
  sessionName: "溪湖場",
  location: "湖北國民小學",
  dateStart: "2026-10-17",
  dateEnd: "2026-10-18",
  tentNo: "A01",
  memberCount: 4,
  sleepingBagOwn: 1,
  sleepingBagProvided: 3,
  comfortBedRequested: true,
  mealMeat: 3,
  mealVeg: 1,
  officeContact: "溪湖鎮公所",
  unloadEntrance: "大成路一段",
  replyUrl: "https://example.test/notice/x",
};

describe("formatSessionDateRange", () => {
  it("uses the ROC year and weekdays", () => {
    expect(formatSessionDateRange("2026-10-17", "2026-10-18")).toBe("115年10月17日（六）至10月18日（日）");
  });
});

describe("formatTentNo", () => {
  it("zero-pads numeric tent numbers", () => {
    expect(formatTentNo("A", "2")).toBe("A02");
    expect(formatTentNo("D", "20")).toBe("D20");
    expect(formatTentNo(null, "2")).toBe("");
  });
});

describe("buildPreEventNoticeBody", () => {
  it("自搭帳 asks for a plate and has the earlier check-in slot", () => {
    const html = buildPreEventNoticeBody(base);
    expect(html).toContain("下午4時至4時30分");
    expect(html).toContain("車牌號碼");
    expect(html).toContain("活動入口處(大成路一段)卸下帳篷裝備");
    expect(html).toContain("上午10時前");
  });

  it("主辦搭設帳 has no plate row and the later check-in slot", () => {
    const html = buildPreEventNoticeBody({ ...base, selfPitch: false });
    expect(html).toContain("下午4時30分至5時");
    expect(html).toContain("上午8時。");
    expect(html).not.toContain("車牌號碼");
    expect(html).not.toContain("卸貨");
  });

  it("escapes registrant-supplied names", () => {
    expect(buildPreEventNoticeBody({ ...base, leaderName: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("gear rows", () => {
  it("shows sleeping bag split and 福慧床 status with a reminder", () => {
    const html = buildPreEventNoticeBody(base);
    expect(html).toContain("自備 1 份／機關提供 3 份");
    expect(html).toContain("已申請借用");
    expect(html).toContain("請記得自行攜帶");
    expect(html).toContain("攜帶證件抵押領取");
    expect(html).toContain("葷食 3 份／素食 1 份");
    expect(html).toContain("餐點每餐葷食 3 份、素食 1 份");
  });

  it("says 未申請 and skips the pickup line when nothing is borrowed", () => {
    const html = buildPreEventNoticeBody({ ...base, sleepingBagOwn: 4, sleepingBagProvided: 0, comfortBedRequested: false });
    expect(html).toContain("未申請");
    expect(html).not.toContain("借用物資請於報到時");
  });
});
