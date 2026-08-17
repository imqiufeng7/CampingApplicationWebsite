import sanitizeHtml from "sanitize-html";

// Content originates from an authenticated vendor's rich-text editor but renders on
// the public, unauthenticated registration page — sanitizing at render time (not just
// trusting what was stored) means a compromised vendor account can't be used to plant
// stored XSS against every visitor to the public form.
//
// Uses sanitize-html rather than isomorphic-dompurify: dompurify's server-side path
// pulls in jsdom, whose own dependency chain (html-encoding-sniffer -> @exodus/bytes)
// ships an ESM-only file that crashes with ERR_REQUIRE_ESM in Vercel's Node runtime —
// this was taking down every public form page that renders vendor text via
// RichContent. sanitize-html has no DOM/jsdom dependency, so it doesn't hit this.
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "em", "u", "s", "span", "div",
      "ul", "ol", "li", "a", "img", "h1", "h2", "h3",
    ],
    allowedAttributes: {
      "*": ["href", "target", "rel", "src", "alt", "style", "class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Matches dompurify's default of not deep-parsing CSS property values inside
    // style="" — preserves whatever the rich-text editor wrote (colors, alignment)
    // without needing an allowlist of every CSS property it might emit.
    parseStyleAttributes: false,
  });
}
