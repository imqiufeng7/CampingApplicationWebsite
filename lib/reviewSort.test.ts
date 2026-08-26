import { describe, it, expect } from "vitest";
import { sortRegistrationsForReview, type SortableRegistration } from "@/lib/reviewSort";

function reg(id: string, submitted_at: string, sleeping_bag_own_qty: number): SortableRegistration {
  return { id, submitted_at, sleeping_bag_own_qty };
}

describe("sortRegistrationsForReview", () => {
  it("puts fully self-supplied groups before groups that need any rented bags", () => {
    const registrations = [
      reg("not-self-supplied", "2026-01-01T00:00:00Z", 1), // needs 1 rented (2 - 1)
      reg("self-supplied", "2026-01-02T00:00:00Z", 2),
    ];
    const memberCountById = new Map([
      ["not-self-supplied", 2],
      ["self-supplied", 2],
    ]);

    const sorted = sortRegistrationsForReview(registrations, memberCountById);
    expect(sorted.map((r) => r.id)).toEqual(["self-supplied", "not-self-supplied"]);
  });

  it("within the same self-supplied tier, sorts larger groups first", () => {
    const registrations = [reg("group-of-2", "t", 2), reg("group-of-4", "t", 4)];
    const memberCountById = new Map([
      ["group-of-2", 2],
      ["group-of-4", 4],
    ]);

    const sorted = sortRegistrationsForReview(registrations, memberCountById);
    expect(sorted.map((r) => r.id)).toEqual(["group-of-4", "group-of-2"]);
  });

  it("within the same tier and size, sorts earliest submission first", () => {
    const registrations = [
      reg("submitted-later", "2026-01-02T00:00:00Z", 0),
      reg("submitted-earlier", "2026-01-01T00:00:00Z", 0),
    ];
    const memberCountById = new Map([
      ["submitted-later", 2],
      ["submitted-earlier", 2],
    ]);

    const sorted = sortRegistrationsForReview(registrations, memberCountById);
    expect(sorted.map((r) => r.id)).toEqual(["submitted-earlier", "submitted-later"]);
  });

  it("treats a registration with no known member count as not self-supplied", () => {
    // memberCountById.get(...) ?? 0 means an unknown id can never satisfy
    // "own_qty >= memberCount && memberCount > 0", regardless of own_qty.
    const registrations = [reg("unknown-member-count", "t", 5), reg("known-self-supplied", "t", 1)];
    const memberCountById = new Map([["known-self-supplied", 1]]);

    const sorted = sortRegistrationsForReview(registrations, memberCountById);
    expect(sorted.map((r) => r.id)).toEqual(["known-self-supplied", "unknown-member-count"]);
  });

  it("does not mutate the input array", () => {
    const registrations = [reg("a", "2026-01-02T00:00:00Z", 0), reg("b", "2026-01-01T00:00:00Z", 0)];
    const original = [...registrations];
    sortRegistrationsForReview(registrations, new Map());
    expect(registrations).toEqual(original);
  });
});
