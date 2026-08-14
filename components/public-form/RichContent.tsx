import { sanitizeContentHtml } from "@/lib/sanitizeHtml";
import { ensureHtml } from "@/lib/contentHtml";

export function RichContent({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose-content text-sm ${className ?? ""}`}
      // Sanitized just before render — see lib/sanitizeHtml.ts for why this can't be
      // trusted purely from having been sanitized once at write time.
      dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(ensureHtml(html)) }}
    />
  );
}
