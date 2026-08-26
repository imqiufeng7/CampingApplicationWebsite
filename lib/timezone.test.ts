import { describe, it, expect } from "vitest";
import {
  taipeiParts,
  isoToTaipeiInputValue,
  taipeiInputValueToIso,
  formatSessionDateWithWeekday,
  formatDeadlineRocWithWeekday,
} from "@/lib/timezone";

describe("taipeiParts", () => {
  it("shifts a UTC instant to Taipei (+8) wall-clock components", () => {
    // 2026-01-01T16:30:00Z is 2026-01-02T00:30:00+08:00 in Taipei.
    const p = taipeiParts(new Date("2026-01-01T16:30:00Z"));
    expect(p).toMatchObject({ year: 2026, month: 1, day: 2, hour: 0, minute: 30 });
  });
});

describe("isoToTaipeiInputValue / taipeiInputValueToIso round trip", () => {
  it("converts a UTC ISO timestamp to a Taipei wall-clock datetime-local string", () => {
    expect(isoToTaipeiInputValue("2026-01-01T16:30:00Z")).toBe("2026-01-02T00:30");
  });

  it("returns an empty string for a missing value", () => {
    expect(isoToTaipeiInputValue(null)).toBe("");
    expect(isoToTaipeiInputValue(undefined)).toBe("");
  });

  it("converts a naive datetime-local value back to a +08:00 ISO string", () => {
    expect(taipeiInputValueToIso("2026-01-02T00:30")).toBe("2026-01-02T00:30:00+08:00");
  });

  it("returns null for an empty/missing datetime-local value", () => {
    expect(taipeiInputValueToIso("")).toBeNull();
    expect(taipeiInputValueToIso(undefined)).toBeNull();
  });

  it("round-trips without drifting", () => {
    const original = "2026-03-14T09:05:00Z";
    const inputValue = isoToTaipeiInputValue(original);
    const backToIso = taipeiInputValueToIso(inputValue);
    // Both represent the same instant even though the literal strings differ
    // (Z vs +08:00 offset notation).
    expect(new Date(backToIso!).getTime()).toBe(new Date(original).getTime());
  });
});

describe("formatSessionDateWithWeekday", () => {
  it("formats a single date with its Chinese weekday", () => {
    // 2025-11-15 is a Saturday.
    expect(formatSessionDateWithWeekday("2025-11-15", null)).toBe("11月15日(星期六)");
  });

  it("formats a date range as start至end", () => {
    // 2025-11-16 is a Sunday.
    expect(formatSessionDateWithWeekday("2025-11-15", "2025-11-16")).toBe(
      "11月15日(星期六)至11月16日(星期日)"
    );
  });

  it("collapses a same-day range to a single date", () => {
    expect(formatSessionDateWithWeekday("2025-11-15", "2025-11-15")).toBe("11月15日(星期六)");
  });

  it("returns an empty string with no start date", () => {
    expect(formatSessionDateWithWeekday(null, null)).toBe("");
  });
});

describe("formatDeadlineRocWithWeekday", () => {
  it("formats a UTC timestamp as ROC year + weekday + Taipei time", () => {
    // 2025-10-31T04:00:00Z is 2025-10-31 12:00 in Taipei; 2025 - 1911 = 114;
    // 2025-10-31 is a Friday.
    expect(formatDeadlineRocWithWeekday("2025-10-31T04:00:00Z")).toBe("114年10月31日（星期五）12:00");
  });

  it("rolls over to the next Taipei calendar day when the UTC offset crosses midnight", () => {
    // 2025-10-31T20:00:00Z is 2025-11-01 04:00 in Taipei (crosses into Saturday).
    expect(formatDeadlineRocWithWeekday("2025-10-31T20:00:00Z")).toBe("114年11月1日（星期六）04:00");
  });
});
