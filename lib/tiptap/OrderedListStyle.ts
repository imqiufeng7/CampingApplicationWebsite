import { Extension } from "@tiptap/core";

// Adds a `listStyleType` attribute to orderedList nodes so the toolbar can offer a
// second numbering style alongside the default "1. 2. 3.". `trad-chinese-informal` is
// a standard CSS predefined counter style (CSS Counter Styles L3) — additive, so it
// renders 十/十一/十二/... the way Traditional Chinese is actually written, with a
// built-in "、" suffix. (`cjk-decimal`, tried first, is the wrong one: it's a
// positional/numeric system, so it renders 10 as "一〇" — digit-by-digit like the
// decimal system — not "十".)
export const CJK_ORDERED_LIST_STYLE = "trad-chinese-informal";

export interface OrderedListStyleOptions {
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    orderedListStyle: {
      setOrderedListStyle: (style: string | null) => ReturnType;
    };
  }
}

export const OrderedListStyle = Extension.create<OrderedListStyleOptions>({
  name: "orderedListStyle",

  addOptions() {
    return { types: ["orderedList"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          listStyleType: {
            default: null,
            parseHTML: (element) => element.style.listStyleType || null,
            renderHTML: (attributes) => {
              if (!attributes.listStyleType) return {};
              // CJK numeral markers ("十四、" etc.) run much wider than the
              // padding-left the base stylesheet reserves for plain "1." markers —
              // without extra room the marker hangs off the left edge of the content
              // box, clipped or invisible in a narrow editor. Reserved inline so it
              // travels with the style regardless of what CSS happens to be loaded.
              const extraPadding =
                attributes.listStyleType === CJK_ORDERED_LIST_STYLE ? " padding-left: 3.5em;" : "";
              return { style: `list-style-type: ${attributes.listStyleType};${extraPadding}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setOrderedListStyle:
        (style: string | null) =>
        ({ commands }) =>
          commands.updateAttributes("orderedList", { listStyleType: style }),
    };
  },
});
