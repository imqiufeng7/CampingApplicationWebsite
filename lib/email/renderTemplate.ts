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
  let result = preserveBlankLines(ensureHtml(template));
  for (const [key, value] of Object.entries(vars)) {
    const safeValue = escapeHtml(value).replace(/\n/g, "<br>");
    result = result.replaceAll(`{{${key}}}`, safeValue);
  }
  return wrapEmailBody(sanitizeContentHtml(result));
}

// The mailed HTML carries no <style> block at all (see the comment above), so every
// email otherwise renders at whatever default font-size/line-height/paragraph margin
// the recipient's mail client happens to ship — Outlook's Word engine in particular
// defaults to ~11pt Calibri with browser-default <p> margins. Deliberately flat here
// (near-1 line-height, zero paragraph margin) rather than adding any spacing of its
// own: the vendor found extra baked-in spacing impossible to predict from the editor
// (couldn't tell how much gap a blank line vs. a real paragraph break would actually
// produce), so this keeps the mailed output a 1:1 match for what pressing Enter N
// times in EmailBodyEditor looks like — every <p> (blank or not) is exactly one
// line tall, no more — and EmailBodyEditor's own CSS (.tiptap-editor--email in
// globals.css) mirrors this same baseline so the editor actually previews it
// accurately. It only touches <p> tags that don't already carry their own style (a
// vendor-styled paragraph, if the editor ever grows block-level styling, keeps
// whatever they set).
function wrapEmailBody(html: string): string {
  const result = html.replace(/<p(?![^>]*\bstyle=)([^>]*)>/gi, '<p$1 style="margin:0;">');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.25;color:#1a1a1a;">${result}</div>`;
}

// An empty <p></p> — what pressing Enter on an already-blank line produces, both in
// the rich text editor and in ensureHtml's line-by-line conversion of legacy
// plain-text rows — has zero content and therefore zero rendered height in most
// mail clients. Unlike the admin app's own preview (which loads globals.css and can
// fix this with CSS), the actual HTML mailed to recipients carries no stylesheet at
// all, so multiple consecutive blank lines collapse down to a single visual gap.
// Giving each one a literal <br> makes it occupy real vertical space using nothing
// but plain HTML, independent of any CSS support.
function preserveBlankLines(html: string): string {
  return html.replace(/<p>\s*<\/p>/g, "<p><br></p>");
}
