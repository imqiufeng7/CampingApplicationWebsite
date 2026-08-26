import { describe, it, expect } from "vitest";
import { ensureHtml, escapeHtml, hasVisibleContent, withFallback } from "@/lib/contentHtml";

describe("ensureHtml", () => {
  it("returns an empty string as-is", () => {
    expect(ensureHtml("")).toBe("");
  });

  it("passes already-HTML content through untouched", () => {
    const html = "<p>hello</p><p><strong>bold</strong></p>";
    expect(ensureHtml(html)).toBe(html);
  });

  it("wraps legacy plain-text lines in <p> each", () => {
    expect(ensureHtml("line one\nline two")).toBe("<p>line one</p><p>line two</p>");
  });

  it("escapes stray & in a plain-text line while wrapping it", () => {
    expect(ensureHtml("A & B")).toBe("<p>A &amp; B</p>");
  });

  it("treats text containing something tag-shaped as already-HTML and leaves it untouched", () => {
    // This is the documented tradeoff of a regex heuristic instead of real HTML
    // parsing: plain text that merely looks like it has a tag (e.g. a stray "<two>")
    // is treated as already-HTML and passed through as-is, unescaped.
    expect(ensureHtml("line one\nline <two>")).toBe("line one\nline <two>");
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, > but leaves other characters (including quotes) alone", () => {
    expect(escapeHtml(`a & b <c> "d"`)).toBe(`a &amp; b &lt;c&gt; "d"`);
  });
});

describe("hasVisibleContent", () => {
  it("treats null/undefined/empty as no content", () => {
    expect(hasVisibleContent(null)).toBe(false);
    expect(hasVisibleContent(undefined)).toBe(false);
    expect(hasVisibleContent("")).toBe(false);
  });

  it("treats TipTap's empty-editor output as no content", () => {
    expect(hasVisibleContent("<p></p>")).toBe(false);
    expect(hasVisibleContent("<p><br></p>")).toBe(false);
    expect(hasVisibleContent("<p>&nbsp;</p>")).toBe(false);
  });

  it("treats real text as content", () => {
    expect(hasVisibleContent("<p>hello</p>")).toBe(true);
  });

  it("treats an embedded image as content even with no caption text", () => {
    expect(hasVisibleContent('<p><img src="x.png" /></p>')).toBe(true);
  });
});

describe("withFallback", () => {
  it("uses the fallback when the field has no visible content", () => {
    expect(withFallback("<p></p>", "default text")).toBe("default text");
    expect(withFallback(null, "default text")).toBe("default text");
  });

  it("keeps the real value when it has visible content", () => {
    expect(withFallback("<p>real content</p>", "default text")).toBe("<p>real content</p>");
  });
});
