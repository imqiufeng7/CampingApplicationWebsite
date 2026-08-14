// Shared between the review list and the registration detail page's 上一筆/下一筆
// navigation, so "next" in the detail page always matches what's actually next in the
// list the reviewer is working through.
export interface SortableRegistration {
  id: string;
  submitted_at: string;
  sleeping_bag_own_qty: number;
}

// Groups that fully self-supply sleeping bags/pads first, then by group size
// descending (4 people before 3, etc.), and within the same tier, earliest submission
// first.
export function sortRegistrationsForReview<T extends SortableRegistration>(
  registrations: T[],
  memberCountById: Map<string, number>
): T[] {
  return [...registrations].sort((a, b) => {
    const aMemberCount = memberCountById.get(a.id) ?? 0;
    const bMemberCount = memberCountById.get(b.id) ?? 0;
    const aSelfSupplied = a.sleeping_bag_own_qty >= aMemberCount && aMemberCount > 0;
    const bSelfSupplied = b.sleeping_bag_own_qty >= bMemberCount && bMemberCount > 0;

    if (aSelfSupplied !== bSelfSupplied) return aSelfSupplied ? -1 : 1;
    if (aMemberCount !== bMemberCount) return bMemberCount - aMemberCount;
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });
}
