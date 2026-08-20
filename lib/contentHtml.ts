// Content fields were plain text (newline-separated) before the rich text editor was
// added; real session data already exists in that format. Detecting "no HTML tags
// present" and wrapping each line in <p> keeps old content displaying/editing exactly
// as before, while content saved by the new editor (which always contains tags)
// passes through untouched.
const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;

export function ensureHtml(value: string): string {
  if (!value) return "";
  if (HTML_TAG_PATTERN.test(value)) {
    return value;
  }
  return value
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Whether a rich-text field's stored HTML has any actually-visible content. Deleting
// everything typed into the TipTap editor leaves behind "<p></p>" (or
// "<p><br></p>"), not a true empty string — a non-empty string that's still truthy in
// a plain `session.field &&` check, so a field the vendor emptied out kept rendering
// as a blank section instead of disappearing. An embedded image with no caption text
// still counts as real content.
export function hasVisibleContent(value: string | null | undefined): boolean {
  if (!value) return false;
  if (/<img\b/i.test(value)) return true;
  const textOnly = value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return textOnly.length > 0;
}

// Same idea as `value || fallback`, but treats "<p></p>"-style empty HTML as absent
// too — a plain `||` lets an emptied-out field win over the fallback since it's still
// a non-empty string.
export function withFallback(value: string | null | undefined, fallback: string): string {
  return hasVisibleContent(value) ? (value as string) : fallback;
}
