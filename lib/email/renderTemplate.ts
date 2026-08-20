import { escapeHtml, ensureHtml } from "@/lib/contentHtml";
import { sanitizeContentHtml } from "@/lib/sanitizeHtml";

// Same {{placeholder}} substitution convention as ConsentGate's renderGateText —
// used to fill vendor-editable email template text with system-computed values
// (member lists, links, payment blocks) at send time. Plain substitution, no
// escaping — only ever used for the subject line, which mail clients always render
// as plain text (an HTML entity there would show up literally, e.g. "&amp;").
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// Same substitution, for the email body — which is now HTML (see EmailBodyEditor).
// ensureHtml() first, because template rows saved before this feature existed are
// still plain text with literal newlines: substituting into that as-is and sending
// it as an HTML part would collapse every line break per normal HTML whitespace
// rules, turning the whole body into one run-on paragraph. ensureHtml wraps each
// line in <p> for those legacy rows and passes already-HTML rows through untouched
// (same convention RichTextEditor/RichContent use for session content fields).
//
// The template itself is vendor-authored via a TipTap editor already constrained to
// safe tags, but the substituted values (member names, resubmission notes, ...)
// originate from public registrant input, so each value is HTML-escaped before
// insertion and its line breaks converted to <br> (plain "\n" would otherwise just
// collapse per normal HTML whitespace rules instead of showing as separate lines).
// sanitizeContentHtml runs last as a defense-in-depth pass over the whole result,
// same rationale as RichContent's render-time sanitization.
export function renderHtmlTemplate(template: string, vars: Record<string, string>): string {
  let result = ensureHtml(template);
  for (const [key, value] of Object.entries(vars)) {
    const safeValue = escapeHtml(value).replace(/\n/g, "<br>");
    result = result.replaceAll(`{{${key}}}`, safeValue);
  }
  return sanitizeContentHtml(result);
}
