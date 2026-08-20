"use client";

import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { ensureHtml } from "@/lib/contentHtml";
import { Button } from "@/components/ui/button";
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react";

// Trimmed-down sibling of RichTextEditor.tsx — email bodies only need bold/italic/
// underline (no images, colors, lists, or indent — nothing in the send pipeline
// renders those, and it keeps the toolbar focused on what was actually asked for).
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
    extensions: [StarterKit, Underline],
    content: ensureHtml(defaultValue),
    editorProps: {
      attributes: { class: "tiptap-editor" },
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
      </div>
      <div className="rounded-b-lg border text-sm" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input ref={hiddenInputRef} type="hidden" name={name} defaultValue={ensureHtml(defaultValue)} />
    </div>
  );
}
