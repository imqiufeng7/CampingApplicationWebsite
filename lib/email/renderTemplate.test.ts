import { describe, it, expect } from "vitest";
import { renderTemplate, renderHtmlTemplate } from "@/lib/email/renderTemplate";

describe("renderTemplate (subject line — plain, no escaping)", () => {
  it("substitutes every {{placeholder}}", () => {
    expect(renderTemplate("Hello {{name}}, you are {{age}}", { name: "World", age: "5" })).toBe(
      "Hello World, you are 5"
    );
  });

  it("does not HTML-escape substituted values — mail clients render the subject as plain text", () => {
    expect(renderTemplate("{{value}}", { value: "<b>&amp;</b>" })).toBe("<b>&amp;</b>");
  });

  it("leaves unmatched placeholders untouched", () => {
    expect(renderTemplate("{{known}} {{unknown}}", { known: "x" })).toBe("x {{unknown}}");
  });
});

// renderHtmlTemplate now wraps its output in a baseline font-size/line-height <div>
// (see wrapEmailBody in renderTemplate.ts — mailed HTML has no <style> block, so this
// is the only way to get a consistent size/spacing across mail clients) and adds an
// inline margin to every bare <p>. These helpers strip that wrapper back off so each
// test can keep asserting on just the substitution/escaping behavior it's actually
// about, rather than repeating the wrapper markup in every expectation.
const WRAPPER_OPEN = /^<div style="[^"]*">/;
const WRAPPER_CLOSE = /<\/div>$/;
function unwrap(html: string): string {
  return html.replace(WRAPPER_OPEN, "").replace(WRAPPER_CLOSE, "");
}

describe("renderHtmlTemplate (email body — HTML, escaped substitutions)", () => {
  it("wraps the whole body in a baseline font-size/line-height container", () => {
    const html = renderHtmlTemplate("Hi {{name}}", { name: "Amy" });
    expect(html).toMatch(WRAPPER_OPEN);
    expect(html).toMatch(WRAPPER_CLOSE);
    expect(html).toContain("font-size:16px");
    expect(html).toContain("line-height:1.25");
  });

  it("wraps a legacy plain-text template in <p> before substituting (ensureHtml)", () => {
    expect(unwrap(renderHtmlTemplate("Hi {{name}}", { name: "Amy" }))).toBe(
      '<p style="margin:0;">Hi Amy</p>'
    );
  });

  it("HTML-escapes substituted values so registrant input can't break the markup", () => {
    expect(unwrap(renderHtmlTemplate("Hi {{name}}", { name: "<script>alert(1)</script>" }))).toBe(
      '<p style="margin:0;">Hi &lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
  });

  it("converts newlines inside a substituted value to <br>", () => {
    // sanitizeContentHtml (the last step) re-serializes <br> in self-closing form —
    // functionally identical, just not byte-identical to what renderHtmlTemplate
    // itself inserts before that pass.
    expect(unwrap(renderHtmlTemplate("<p>List: {{items}}</p>", { items: "a\nb\nc" }))).toBe(
      '<p style="margin:0;">List: a<br />b<br />c</p>'
    );
  });

  it("gives every blank <p></p> (from consecutive Enters) a literal <br>, exactly one line tall (zero margin) so N Enters in the editor always means N blank lines in the mailed output", () => {
    expect(unwrap(renderHtmlTemplate("<p>one</p><p></p><p>two</p>", {}))).toBe(
      '<p style="margin:0;">one</p><p style="margin:0;"><br /></p><p style="margin:0;">two</p>'
    );
  });

  it("passes an already-HTML template through unchanged aside from substitution and paragraph margins", () => {
    const template = "<p>{{greeting}}</p><p><strong>bold text</strong></p>";
    expect(unwrap(renderHtmlTemplate(template, { greeting: "Hello" }))).toBe(
      '<p style="margin:0;">Hello</p><p style="margin:0;"><strong>bold text</strong></p>'
    );
  });

  it("leaves a paragraph's own style attribute untouched instead of overwriting it", () => {
    const template = '<p style="text-align:center">{{greeting}}</p>';
    expect(unwrap(renderHtmlTemplate(template, { greeting: "Hello" }))).toBe(
      '<p style="text-align:center">Hello</p>'
    );
  });
});
