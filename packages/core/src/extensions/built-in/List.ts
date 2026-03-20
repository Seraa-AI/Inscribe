import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { chainCommands, splitBlock } from "prosemirror-commands";
import type { NodeType } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { Extension } from "../Extension";
import { ListItemStrategy } from "../../layout/ListItemStrategy";
import type { ToolbarItemSpec } from "../types";

/**
 * Toggle a list type — mirrors Google Docs behaviour:
 *  - Not in a list        → wrap in the given list type
 *  - Already in same type → lift all items back to paragraphs
 *  - In a different type  → convert to the given list type (setNodeMarkup)
 */
function makeToggleList(listType: NodeType, itemType: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;

    for (let d = $from.depth; d > 0; d--) {
      const ancestor = $from.node(d);

      if (ancestor.type === listType) {
        // Same list type — toggle off
        return liftListItem(itemType)(state, dispatch);
      }

      if (ancestor.type.name === "bulletList" || ancestor.type.name === "orderedList") {
        // Different list type — convert
        if (dispatch) {
          dispatch(state.tr.setNodeMarkup($from.before(d), listType));
        }
        return true;
      }
    }

    // Not in any list — wrap
    return wrapInList(listType)(state, dispatch);
  };
}

/**
 * List — bullet and ordered list support.
 *
 * Nodes added:
 *   bulletList  — unordered list container
 *   orderedList — ordered list container (attrs: order)
 *   listItem    — single list item (content: paragraph block*)
 *
 * Keyboard behaviour (matches Google Docs / Word):
 *   Enter           → split list item (exit list when item is empty)
 *   Tab             → sink list item (indent deeper)
 *   Shift-Tab       → lift list item (dedent / exit list)
 *
 * Toolbar:
 *   • Bullet list
 *   1. Ordered list
 */
export const List = Extension.create({
  name: "list",

  addNodes() {
    return {
      bulletList: {
        group: "block",
        content: "listItem+",
        parseDOM: [{ tag: "ul" }],
        toDOM: () => ["ul", 0],
      },
      orderedList: {
        group: "block",
        content: "listItem+",
        attrs: { order: { default: 1 } },
        parseDOM: [
          {
            tag: "ol",
            getAttrs: (dom) => ({
              order: (dom as HTMLOListElement).start ?? 1,
            }),
          },
        ],
        toDOM: (node) => ["ol", { start: node.attrs["order"] }, 0],
      },
      listItem: {
        content: "paragraph block*",
        defining: true,
        parseDOM: [{ tag: "li" }],
        toDOM: () => ["li", 0],
      },
    };
  },

  addKeymap() {
    const { bulletList, orderedList, listItem } = this.schema.nodes;
    return {
      // Chain: splitListItem handles Enter inside a list; splitBlock handles it everywhere else.
      // Without the chain, splitListItem overwrites Paragraph's splitBlock binding, breaking Enter outside lists.
      Enter: chainCommands(splitListItem(listItem!), splitBlock),
      Tab: sinkListItem(listItem!),
      "Shift-Tab": liftListItem(listItem!),
      // Mod-Shift-8: toggle bullet list (⌘⇧8 = • on most keyboards)
      "Mod-Shift-8": makeToggleList(bulletList!, listItem!),
      // Mod-Shift-9: toggle ordered list (⌘⇧9 = ( )
      "Mod-Shift-9": makeToggleList(orderedList!, listItem!),
    };
  },

  addCommands() {
    const { bulletList, orderedList, listItem } = this.schema.nodes;
    return {
      toggleBulletList: () => makeToggleList(bulletList!, listItem!),
      toggleOrderedList: () => makeToggleList(orderedList!, listItem!),
      liftListItem: () => liftListItem(listItem!),
      sinkListItem: () => sinkListItem(listItem!),
    };
  },

  addLayoutHandlers() {
    return { list_item: ListItemStrategy };
  },

  addBlockStyles() {
    return {
      list_item: {
        font: "14px Georgia, serif",
        spaceBefore: 0,
        spaceAfter: 4,
        align: "left" as const,
      },
    };
  },

  addToolbarItems(): ToolbarItemSpec[] {
    return [
      {
        command: "toggleBulletList",
        label: "•",
        title: "Bullet list (⌘⇧8)",
        isActive: (_marks, blockType) => blockType === "bulletList",
      },
      {
        command: "toggleOrderedList",
        label: "1.",
        title: "Ordered list (⌘⇧9)",
        isActive: (_marks, blockType) => blockType === "orderedList",
      },
    ];
  },
});
