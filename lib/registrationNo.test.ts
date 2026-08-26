import { describe, it, expect } from "vitest";
import { formatRegistrationNo } from "@/lib/registrationNo";

describe("formatRegistrationNo", () => {
  it("pads to 6 digits with an R prefix", () => {
    expect(formatRegistrationNo(1)).toBe("R000001");
    expect(formatRegistrationNo(123)).toBe("R000123");
  });

  it("doesn't truncate a sequence number that's already 6+ digits", () => {
    expect(formatRegistrationNo(123456)).toBe("R123456");
    expect(formatRegistrationNo(1234567)).toBe("R1234567");
  });
});
