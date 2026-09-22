import "server-only";

// Table-based, inline-styled shell wrapped around the vendor-edited template body
// (renderHtmlTemplate's output, untouched) — this is the subset of HTML/CSS that
// survives Outlook's Word rendering engine, Gmail's stripped <style> tags, and mobile
// mail clients alike (no flexbox/grid, no external stylesheet, no box-shadow reliance).
export interface EmailLayoutOptions {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  // event_sessions.theme_color — the same per-session accent already used on the
  // public registration page (app/(public)/s/[sessionId]/page.tsx). Falls back to a
  // neutral brand color for session-less mail (the admin invite) or an unset session.
  accentColor?: string | null;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerLine?: string;
}

const DEFAULT_ACCENT = "#3f7d58";

// Hardcoded for now (this app currently only runs this one event series) — revisit
// once a session's series name should drive this instead.
export const EVENT_EYEBROW = "彰化縣115年防災教育日 災民(露天)夜宿體驗活動";

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const v = ((int >> shift) & 0xff) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

// Picks readable text for whatever accent color a session was given — a light
// theme_color (this app's own default palette leans pastel, e.g. #f3ebb4) needs dark
// text, a dark custom color needs white, and either way the header stays legible.
function readableTextColor(hex: string): string {
  const luminance = relativeLuminance(hex);
  return luminance === null || luminance > 0.55 ? "#1a1a1a" : "#ffffff";
}

export function wrapEmailLayout(opts: EmailLayoutOptions): string {
  const accent = opts.accentColor?.trim() || DEFAULT_ACCENT;
  const headerText = readableTextColor(accent);
  const headerSubtext = headerText === "#ffffff" ? "#ffffffcc" : "#1a1a1acc";
  const buttonText = readableTextColor(accent);

  return `<!doctype html>
<html lang="zh-Hant">
<body style="margin:0;padding:0;background-color:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'PingFang TC','Microsoft JhengHei',Arial,sans-serif;">
  <tr>
    <td style="background-color:${accent};padding:28px 32px;">
      ${opts.eyebrow ? `<div style="font-size:13px;color:${headerSubtext};">${opts.eyebrow}</div>` : ""}
      <div style="font-size:20px;font-weight:700;color:${headerText};margin-top:${opts.eyebrow ? "6px" : "0"};">${opts.heading}</div>
      ${opts.subheading ? `<div style="font-size:14px;color:${headerSubtext};margin-top:4px;">${opts.subheading}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 8px 32px;">
      ${opts.bodyHtml}
    </td>
  </tr>
  ${
    opts.ctaUrl
      ? `<tr><td style="padding:8px 32px 28px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background-color:${accent};">
      <a href="${opts.ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:${buttonText};text-decoration:none;">${opts.ctaLabel ?? "查看詳情"} →</a>
    </td></tr></table>
  </td></tr>`
      : ""
  }
  <tr>
    <td style="padding:20px 32px;background-color:#faf8f3;border-top:1px solid #ece7db;">
      <div style="font-size:12px;color:#8a8478;line-height:1.6;">
        ${opts.footerLine ?? "如有任何問題，請直接回覆本信聯繫主辦單位。"}
      </div>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
