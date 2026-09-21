import { describe, expect, it } from "vitest";
import { computeEcpayExpiry } from "@/lib/ecpay/expiry";

const now = new Date("2026-09-21T00:00:00Z");

describe("computeEcpayExpiry", () => {
  it("rounds ATM days down and gives CVS minute precision", () => {
    const deadline = new Date(now.getTime() + (3 * 24 * 60 + 90) * 60 * 1000);
    expect(computeEcpayExpiry(deadline, now)).toEqual({ ExpireDate: 3, StoreExpireDate: 3 * 24 * 60 + 90 });
  });

  it("floors ATM days at ECPay's 1-day minimum when under a day remains", () => {
    const deadline = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    expect(computeEcpayExpiry(deadline, now)).toEqual({ ExpireDate: 1, StoreExpireDate: 300 });
  });

  it("caps at ECPay's maximums", () => {
    const deadline = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000);
    expect(computeEcpayExpiry(deadline, now)).toEqual({ ExpireDate: 60, StoreExpireDate: 43200 });
  });
});
