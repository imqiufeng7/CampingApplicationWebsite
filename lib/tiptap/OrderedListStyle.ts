import { Extension } from "@tiptap/core";

// Adds a `listStyleType` attribute to orderedList nodes so the toolbar can offer a
// second numbering style alongside the default "1. 2. 3.". `cjk-decimal` is a
// standard CSS predefined counter style (CSS Counter Styles L3) whose suffix is
// itself "、" — i.e. "一、二、三、..." comes for free from the browser, no custom
// counter logic needed.
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
              return { style: `list-style-type: ${attributes.listStyleType}` };
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
