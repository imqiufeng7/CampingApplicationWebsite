"use client";

import { useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { FontSize } from "@/lib/tiptap/FontSize";
import { Indent } from "@/lib/tiptap/Indent";
import { OrderedListStyle, CJK_ORDERED_LIST_STYLE } from "@/lib/tiptap/OrderedListStyle";
import { ensureHtml } from "@/lib/contentHtml";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  IndentIncreaseIcon,
  IndentDecreaseIcon,
} from "lucide-react";

const FONT_SIZES = [
  { label: "小", value: "0.8em" },
  { label: "正常", value: "" },
  { label: "大", value: "1.3em" },
  { label: "特大", value: "1.8em" },
];

const COLORS = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#d97706", "#7c3aed"];

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Content typed as plain paragraphs commonly uses a blank paragraph as visual spacing
// between items (e.g. manually-numbered "一、..." / "二、..." lines with a blank line
// between each). Converting a selection like that straight to a list would wrap each
// blank spacer as its own empty <li> too — every real item's list-rendered number then
// drifts further off from whatever number is already typed in its text, and the
// spacers show up as blank bullets. Deleting empty paragraphs from the selection right
// before toggling a list keeps the numbering aligned with what's actually there.
function removeEmptyParagraphsInSelection(editor: Editor) {
  const { state } = editor;
  const { from, to } = state.selection;
  const ranges: { from: number; to: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "paragraph" && node.content.size === 0) {
      ranges.push({ from: pos, to: pos + node.nodeSize });
    }
  });
  if (ranges.length === 0) return;
  let tr = state.tr;
  for (let i = ranges.length - 1; i >= 0; i--) {
    tr = tr.delete(ranges[i].from, ranges[i].to);
  }
  editor.view.dispatch(tr);
}

export function RichTextEditor({
  name,
  sessionId,
  defaultValue,
  minHeight = "8rem",
}: {
  name: string;
  sessionId: string;
  defaultValue: string;
  minHeight?: string;
}) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Indent,
      OrderedListStyle,
      Image.configure({ inline: false }),
    ],
    content: ensureHtml(defaultValue),
    editorProps: {
      attributes: { class: "tiptap-editor" },
    },
    onUpdate: ({ editor }) => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = editor.getHTML();
      }
    },
  });

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const extension = EXTENSION_BY_TYPE[file.type];
    if (!extension) {
      e.target.value = "";
      return;
    }

    const supabase = createClient();
    const path = `${sessionId}/content-images/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from("session-assets")
      .upload(path, file, { contentType: file.type });

    if (!error) {
      const { data } = supabase.storage.from("session-assets").getPublicUrl(path);
      editor.chain().focus().setImage({ src: data.publicUrl }).run();
    }
    e.target.value = "";
  }

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
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="icon-sm"
          title="項目符號"
          onClick={() => {
            if (!editor.isActive("bulletList")) removeEmptyParagraphsInSelection(editor);
            editor.chain().focus().toggleBulletList().run();
          }}
        >
          <ListIcon />
        </Button>
        <Button
          type="button"
          variant={
            editor.isActive("orderedList", { listStyleType: null }) ? "secondary" : "ghost"
          }
          size="icon-sm"
          title="數字清單（1. 2. 3.）"
          onClick={() => {
            if (editor.isActive("orderedList", { listStyleType: CJK_ORDERED_LIST_STYLE })) {
              // Currently showing Chinese numerals — switch style instead of turning
              // the list off, since that's what clicking "switch to 1.2.3" means here.
              editor.chain().focus().setOrderedListStyle(null).run();
            } else {
              if (!editor.isActive("orderedList")) removeEmptyParagraphsInSelection(editor);
              editor.chain().focus().toggleOrderedList().run();
            }
          }}
        >
          <ListOrderedIcon />
        </Button>
        <Button
          type="button"
          variant={
            editor.isActive("orderedList", { listStyleType: CJK_ORDERED_LIST_STYLE }) ? "secondary" : "ghost"
          }
          size="sm"
          title="中文數字清單（一、二、三、）"
          onClick={() => {
            if (editor.isActive("orderedList", { listStyleType: CJK_ORDERED_LIST_STYLE })) {
              editor.chain().focus().toggleOrderedList().run();
            } else if (editor.isActive("orderedList")) {
              // Already an ordered list showing 1.2.3 — switch style, keep it on.
              editor.chain().focus().setOrderedListStyle(CJK_ORDERED_LIST_STYLE).run();
            } else {
              removeEmptyParagraphsInSelection(editor);
              editor.chain().focus().toggleOrderedList().run();
              editor.chain().focus().setOrderedListStyle(CJK_ORDERED_LIST_STYLE).run();
            }
          }}
        >
          一二三
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="增加縮排"
          onClick={() => {
            if (editor.isActive("listItem")) {
              editor.chain().focus().sinkListItem("listItem").run();
            } else {
              editor.chain().focus().indent().run();
            }
          }}
        >
          <IndentIncreaseIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="減少縮排"
          onClick={() => {
            if (editor.isActive("listItem")) {
              editor.chain().focus().liftListItem("listItem").run();
            } else {
              editor.chain().focus().outdent().run();
            }
          }}
        >
          <IndentDecreaseIcon />
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

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => fileInputRef.current?.click()}
          title="插入圖片"
        >
          <ImageIcon />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImageSelect}
        />
      </div>
      <div className="rounded-b-lg border" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input ref={hiddenInputRef} type="hidden" name={name} defaultValue={ensureHtml(defaultValue)} />
    </div>
  );
}
