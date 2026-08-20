import { Extension, type CommandProps } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// TipTap's open-source core has no per-block indent — this adds an `indentLevel` node
// attribute (same "extend with a custom attribute" approach as FontSize.ts) rendered
// as a margin-left, with indent/outdent commands that step it up/down for every
// matching block node touched by the current selection.
export interface IndentOptions {
  types: string[];
  minLevel: number;
  maxLevel: number;
  stepEm: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return {
      // listItem included so indenting inside a list just shifts the whole <li> (and
      // its marker) right via margin, rather than going through sinkListItem/
      // liftListItem — nesting a real sub-list turned out to not reliably show its
      // own marker in the live editor (ProseMirror/TipTap's default nested-list CSS
      // interaction is finicky), so the indented item's number/bullet would
      // disappear until the page was saved and reloaded. A margin shift can't lose
      // the marker: it's still the same list item, just moved.
      types: ["paragraph", "heading", "listItem"],
      minLevel: 0,
      maxLevel: 8,
      stepEm: 2,
    };
  },

  addGlobalAttributes() {
    const { stepEm } = this.options;
    return [
      {
        types: this.options.types,
        attributes: {
          indentLevel: {
            default: 0,
            parseHTML: (element) => {
              const margin = parseFloat(element.style.marginLeft || "0");
              return Number.isFinite(margin) && margin > 0 ? Math.round(margin / stepEm) : 0;
            },
            renderHTML: (attributes) => {
              const level = attributes.indentLevel;
              if (!level) return {};
              return { style: `margin-left: ${level * stepEm}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const { types, minLevel, maxLevel } = this.options;

    const step =
      (delta: number) =>
      () =>
      ({ tr, state, dispatch }: CommandProps) => {
        const { selection } = state;
        let changed = false;
        state.doc.nodesBetween(selection.from, selection.to, (node: ProseMirrorNode, pos: number) => {
          if (types.includes(node.type.name)) {
            const current = (node.attrs.indentLevel as number | undefined) ?? 0;
            const next = Math.min(maxLevel, Math.max(minLevel, current + delta));
            if (next !== current) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentLevel: next });
              changed = true;
            }
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return {
      indent: step(1),
      outdent: step(-1),
    };
  },
});
