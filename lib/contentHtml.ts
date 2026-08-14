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
