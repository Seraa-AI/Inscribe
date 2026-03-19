import { Extension } from "../Extension";

interface HeadingOptions {
  /** Which heading levels to support. Default: all six. */
  levels: number[];
}

/**
 * Heading — h1 through h6 block nodes.
 *
 * @example
 * Heading.configure({ levels: [1, 2, 3] })
 */
export const Heading = Extension.create<HeadingOptions>({
  name: "heading",

  defaultOptions: {
    levels: [1, 2, 3, 4, 5, 6],
  },

  addNodes() {
    return {
      heading: {
        group: "block",
        content: "inline*",
        attrs: {
          level: { default: 1 },
          align: { default: "left" },
        },
        defining: true,
        parseDOM: this.options.levels.map((level) => ({
          tag: `h${level}`,
          attrs: { level },
        })),
        toDOM: (node) => [`h${node.attrs.level}`, 0],
      },
    };
  },
});
