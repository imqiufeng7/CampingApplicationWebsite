// All timestamps in this system are stored as UTC (Postgres timestamptz), but every
// admin-facing display and every <input type="datetime-local"> must show/accept
// Asia/Taipei wall-clock time — the whole product is Taiwan-only. Letting the
// server's or viewer's own local timezone leak in (Vercel serverless defaults to
// UTC, unrelated to Taipei; a browser could be set to anything) silently shifts every
// deadline by hours. Taipei has no DST, so a fixed +08:00 offset is always correct —
// no Intl/tz-database dependency needed.
export const TAIPEI_TIME_ZONE = "Asia/Taipei";

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Splits an absolute instant into its Asia/Taipei wall-clock components, independent
// of whatever timezone the Node process itself happens to be configured with.
export function taipeiParts(date: Date) {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

// For <input type="datetime-local"> defaultValue/value: converts a stored UTC ISO
// timestamp into the "YYYY-MM-DDTHH:mm" wall-clock string a Taipei-based admin
// expects to see.
export function isoToTaipeiInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = taipeiParts(new Date(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// Inverse: a submitted <input type="datetime-local"> value (naive "YYYY-MM-DDTHH:mm",
// intended as Taipei wall-clock time) converted into a proper UTC-offset ISO string
// for storage in a timestamptz column. Without this, Postgres/PostgREST interprets
// the naive string as UTC, silently shifting the intended time by 8 hours.
export function taipeiInputValueToIso(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return `${value}:00+08:00`;
}
