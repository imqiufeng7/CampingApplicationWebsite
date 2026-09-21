import { describe, expect, it } from "vitest";
import { isPaidAfterDeadline } from "@/lib/ecpay/paidLate";

const deadline = "2026-09-25T15:59:00Z"; // 2026-09-25 23:59 Taipei

describe("isPaidAfterDeadline", () => {
  it("is false with no deadline", () => {
    expect(isPaidAfterDeadline(null, "2026/09/30 10:00:00")).toBe(false);
  });

  it("reads PaymentDate as Taipei time", () => {
    expect(isPaidAfterDeadline(deadline, "2026/09/25 23:58:00")).toBe(false);
    expect(isPaidAfterDeadline(deadline, "2026/09/26 00:01:00")).toBe(true);
  });

  it("falls back to now when PaymentDate is missing", () => {
    expect(isPaidAfterDeadline(deadline, undefined, new Date("2026-09-27T00:00:00Z"))).toBe(true);
    expect(isPaidAfterDeadline(deadline, "garbage", new Date("2026-09-20T00:00:00Z"))).toBe(false);
  });
});
