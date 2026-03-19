import { Extension } from "../Extension";
import { splitBlock } from "prosemirror-commands";

/**
 * Paragraph — the default block node.
 *
 * Attributes:
 *   align — "left" | "center" | "right" | "justify"
 */
export const Paragraph = Extension.create({
  name: "paragraph",

  addNodes() {
    return {
      paragraph: {
        group: "block",
        content: "inline*",
        attrs: {
          align: { default: "left" },
        },
        parseDOM: [{ tag: "p" }],
        toDOM: (node) => ["p", { style: `text-align:${node.attrs.align}` }, 0],
      },
    };
  },

  addKeymap() {
    return {
      Enter: splitBlock,
    };
  },
});
