import { setBlockType } from "prosemirror-commands";
import { Extension } from "../Extension";
import type { ToolbarItemSpec } from "../types";

interface HeadingOptions {
  levels: number[];
}

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

  addKeymap() {
    const km: Record<string, ReturnType<typeof setBlockType>> = {};
    for (const level of this.options.levels) {
      km[`Mod-Alt-${level}`] = setBlockType(this.schema.nodes["heading"]!, { level });
    }
    km["Mod-Alt-0"] = setBlockType(this.schema.nodes["paragraph"]!);
    return km;
  },

  addCommands() {
    const cmds: Record<string, () => ReturnType<typeof setBlockType>> = {};
    for (const level of this.options.levels) {
      cmds[`setHeading${level}`] = () => setBlockType(this.schema.nodes["heading"]!, { level });
    }
    cmds["setParagraph"] = () => setBlockType(this.schema.nodes["paragraph"]!);
    return cmds;
  },

  addToolbarItems(): ToolbarItemSpec[] {
    const items: ToolbarItemSpec[] = this.options.levels.slice(0, 3).map((level) => ({
      command: `setHeading${level}`,
      label: `H${level}`,
      title: `Heading ${level} (⌘⌥${level})`,
      isActive: (_marks: string[], blockType: string, blockAttrs: Record<string, unknown>) =>
        blockType === "heading" && blockAttrs["level"] === level,
    }));
    items.push({
      command: "setParagraph",
      label: "¶",
      title: "Paragraph (⌘⌥0)",
      isActive: (_marks: string[], blockType: string) => blockType === "paragraph",
    });
    return items;
  },
});
