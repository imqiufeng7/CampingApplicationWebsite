"use client";

import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { FontSize } from "@/lib/tiptap/FontSize";
import { ensureHtml } from "@/lib/contentHtml";
import { Button } from "@/components/ui/button";
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react";

const COLORS = ["#000000", "#6b7280", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed"];

// Relative to the email body's own 14px baseline (see wrapEmailBody in
// lib/email/renderTemplate.ts) — not the same absolute sizes as RichTextEditor's
// FONT_SIZES, since that editor's surrounding page has a different base size.
const FONT_SIZES = [
  { label: "小", value: "0.85em" },
  { label: "正常", value: "" },
  { label: "大", value: "1.3em" },
  { label: "特大", value: "1.7em" },
];

// Trimmed-down sibling of RichTextEditor.tsx — email bodies only need bold/italic/
// underline/color/font size (no images, lists, or indent — nothing in the send
// pipeline renders those, and it keeps the toolbar focused on what was actually
// asked for).
// Same hidden-input pattern as RichTextEditor.tsx so it drops into an existing
// <form action={...}> unchanged; the optional onChange is for callers (the global
// template editor) that also want the live HTML for their own preview pane.
export function EmailBodyEditor({
  name,
  defaultValue,
  onChange,
  minHeight = "10rem",
}: {
  name: string;
  defaultValue: string;
  onChange?: (html: string) => void;
  minHeight?: string;
}) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline, TextStyle, Color, FontSize],
    content: ensureHtml(defaultValue),
    editorProps: {
      attributes: { class: "tiptap-editor tiptap-editor--email" },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = html;
      }
      onChange?.(html);
    },
  });

  if (!editor) {
    return <div style={{ minHeight }} className="rounded-lg border" />;
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 p-1.5">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("underline") ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </Button>
        <select
          aria-label="字體大小"
          className="border-input h-7 rounded-md border bg-transparent px-1.5 text-xs"
          onChange={(e) => {
            if (e.target.value) {
              editor.chain().focus().setFontSize(e.target.value).run();
            } else {
              editor.chain().focus().unsetFontSize().run();
            }
          }}
          defaultValue=""
        >
          {FONT_SIZES.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              className="size-5 rounded-full border"
              style={{ backgroundColor: c }}
              onClick={() => editor.chain().focus().setColor(c).run()}
            />
          ))}
          <button
            type="button"
            title="清除所有文字格式（粗體、斜體、底線、顏色、字級）"
            className="text-muted-foreground px-1 text-xs underline"
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
          >
            清除格式
          </button>
        </div>
      </div>
      <div className="rounded-b-lg border text-sm" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input ref={hiddenInputRef} type="hidden" name={name} defaultValue={ensureHtml(defaultValue)} />
    </div>
  );
}
