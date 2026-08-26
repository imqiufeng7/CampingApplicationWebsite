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

describe("renderHtmlTemplate (email body — HTML, escaped substitutions)", () => {
  it("wraps a legacy plain-text template in <p> before substituting (ensureHtml)", () => {
    expect(renderHtmlTemplate("Hi {{name}}", { name: "Amy" })).toBe("<p>Hi Amy</p>");
  });

  it("HTML-escapes substituted values so registrant input can't break the markup", () => {
    expect(renderHtmlTemplate("Hi {{name}}", { name: "<script>alert(1)</script>" })).toBe(
      "<p>Hi &lt;script&gt;alert(1)&lt;/script&gt;</p>"
    );
  });

  it("converts newlines inside a substituted value to <br>", () => {
    // sanitizeContentHtml (the last step) re-serializes <br> in self-closing form —
    // functionally identical, just not byte-identical to what renderHtmlTemplate
    // itself inserts before that pass.
    expect(renderHtmlTemplate("<p>List: {{items}}</p>", { items: "a\nb\nc" })).toBe(
      "<p>List: a<br />b<br />c</p>"
    );
  });

  it("gives every blank <p></p> (from consecutive Enters) a literal <br> so it has real height", () => {
    expect(renderHtmlTemplate("<p>one</p><p></p><p>two</p>", {})).toBe(
      "<p>one</p><p><br /></p><p>two</p>"
    );
  });

  it("passes an already-HTML template through unchanged aside from substitution", () => {
    const template = "<p>{{greeting}}</p><p><strong>bold text</strong></p>";
    expect(renderHtmlTemplate(template, { greeting: "Hello" })).toBe(
      "<p>Hello</p><p><strong>bold text</strong></p>"
    );
  });
});
