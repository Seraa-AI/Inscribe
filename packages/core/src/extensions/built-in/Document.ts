import { Extension } from "../Extension";

/**
 * Document — contributes the top-level `doc` and `hard_break` nodes.
 *
 * Every editor needs this. StarterKit includes it automatically.
 * `doc` and `text` are always added by ExtensionManager as a baseline,
 * but hard_break must be registered explicitly.
 */
export const Document = Extension.create({
  name: "document",

  addNodes() {
    return {
      hard_break: {
        group: "inline",
        inline: true,
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM: () => ["br"],
      },
    };
  },
});
