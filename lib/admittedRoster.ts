// 錄取名單 (public-facing roster): keeps first and last character of the contact name,
// masks the middle with a Latin "O" (e.g. 謝O如), and only exposes the phone's last 3 digits.
export function maskNameForRoster(name: string): string {
  // Stray leading/trailing whitespace in a stored name (a data-entry typo) would
  // otherwise count as a real character, shifting the mask by one and turning e.g.
  // " 廖芳榮" into " OO榮" instead of "廖O榮".
  const chars = [...name.trim()];
  if (chars.length <= 1) return chars.join("");
  if (chars.length === 2) return `${chars[0]}O`;
  return `${chars[0]}${"O".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export function phoneLast3(phone: string): string {
  return phone.replace(/\D/g, "").slice(-3);
}

// "10/3-10/4" style (no zero padding); a one-day session shows a single date.
function formatMonthDay(dateOnly: string): string {
  const [, m, d] = dateOnly.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function buildRosterTitle(
  sessionName: string,
  dateStart: string | null,
  dateEnd: string | null
): string {
  const dates = dateStart
    ? !dateEnd || dateEnd === dateStart
      ? formatMonthDay(dateStart)
      : `${formatMonthDay(dateStart)}-${formatMonthDay(dateEnd)}`
    : "";
  return `錄取名單（${dates}${sessionName}次）`;
}

export const ROSTER_HEADERS = ["序", "聯絡人姓名", "電話末三碼", "隊伍總人數", "自備睡袋數量", "帳篷類型"];

type RosterSource = {
  memberNames: string[];
  contact_phone: string;
  sleeping_bag_own_qty: number;
  registration_seq: number;
  registration_category_id: string | null;
};

// 帳篷類型 is the registration category: rows are grouped by category in the session's
// configured category order (rows without one last), then by registration number.
export function buildRosterRows(
  rows: RosterSource[],
  categoryOrder: string[],
  categoryLabels: Map<string, string>
): (string | number)[][] {
  const rank = new Map(categoryOrder.map((id, i) => [id, i]));
  const rankOf = (r: RosterSource) =>
    r.registration_category_id ? (rank.get(r.registration_category_id) ?? categoryOrder.length) : categoryOrder.length + 1;

  return [...rows]
    .sort((a, b) => rankOf(a) - rankOf(b) || a.registration_seq - b.registration_seq)
    .map((r, i) => [
      i + 1,
      maskNameForRoster(r.memberNames[0] ?? ""),
      phoneLast3(r.contact_phone),
      r.memberNames.length,
      r.sleeping_bag_own_qty,
      r.registration_category_id ? (categoryLabels.get(r.registration_category_id) ?? "") : "",
    ]);
}
