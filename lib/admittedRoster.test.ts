import { describe, expect, it } from "vitest";
import { buildRosterRows, buildRosterTitle, maskNameForRoster, phoneLast3 } from "@/lib/admittedRoster";

describe("maskNameForRoster", () => {
  it("keeps first and last char", () => {
    expect(maskNameForRoster("謝小如")).toBe("謝O如");
    expect(maskNameForRoster("歐陽小明")).toBe("歐OO明");
  });
  it("handles short names", () => {
    expect(maskNameForRoster("王明")).toBe("王O");
    expect(maskNameForRoster("王")).toBe("王");
    expect(maskNameForRoster("")).toBe("");
  });
  it("ignores stray leading/trailing whitespace from data-entry typos", () => {
    expect(maskNameForRoster(" 廖芳榮")).toBe("廖O榮");
    expect(maskNameForRoster("黃意婷 ")).toBe("黃O婷");
  });
});

describe("phoneLast3", () => {
  it("takes the last three digits, keeping leading zeros", () => {
    expect(phoneLast3("0912-345979")).toBe("979");
    expect(phoneLast3("0912345029")).toBe("029");
  });
});

describe("buildRosterTitle", () => {
  it("formats the date range and session name", () => {
    expect(buildRosterTitle("和美場", "2026-11-15", "2026-11-16")).toBe("錄取名單（11/15-11/16和美場次）");
    expect(buildRosterTitle("二林場", "2026-10-03", "2026-10-04")).toBe("錄取名單（10/3-10/4二林場次）");
  });
  it("handles one-day and undated sessions", () => {
    expect(buildRosterTitle("二林場", "2026-10-03", "2026-10-03")).toBe("錄取名單（10/3二林場次）");
    expect(buildRosterTitle("二林場", null, null)).toBe("錄取名單（二林場次）");
  });
});

describe("buildRosterRows", () => {
  const labels = new Map([["a", "主辦搭設帳"], ["b", "自備帳"]]);
  const base = { memberNames: ["謝小如", "x", "y", "z"], contact_phone: "0912345979", sleeping_bag_own_qty: 0 };

  it("sorts by category order, then registration number, and numbers rows", () => {
    expect(
      buildRosterRows(
        [
          { ...base, registration_seq: 30, registration_category_id: "b" },
          { ...base, memberNames: ["劉大昌"], contact_phone: "0900000812", sleeping_bag_own_qty: 2, registration_seq: 20, registration_category_id: "a" },
          { ...base, registration_seq: 10, registration_category_id: "a" },
          { ...base, registration_seq: 5, registration_category_id: null },
        ],
        ["a", "b"],
        labels
      )
    ).toEqual([
      [1, "謝O如", "979", 4, 0, "主辦搭設帳"],
      [2, "劉O昌", "812", 1, 2, "主辦搭設帳"],
      [3, "謝O如", "979", 4, 0, "自備帳"],
      [4, "謝O如", "979", 4, 0, ""],
    ]);
  });
});
