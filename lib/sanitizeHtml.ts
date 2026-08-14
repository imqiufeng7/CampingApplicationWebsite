import DOMPurify from "isomorphic-dompurify";

// Content originates from an authenticated vendor's rich-text editor but renders on
// the public, unauthenticated registration page — sanitizing at render time (not just
// trusting what was stored) means a compromised vendor account can't be used to plant
// stored XSS against every visitor to the public form.
export function sanitizeContentHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "span", "div",
      "ul", "ol", "li", "a", "img", "h1", "h2", "h3",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "style", "class"],
  });
}
