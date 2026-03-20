import { Extension } from "./Extension";
import { Document } from "./built-in/Document";
import { Paragraph } from "./built-in/Paragraph";
import { Heading } from "./built-in/Heading";
import { Bold } from "./built-in/Bold";
import { Italic } from "./built-in/Italic";
import { History } from "./built-in/History";
import { BaseEditing } from "./built-in/BaseEditing";
import { Underline } from "./built-in/Underline";
import { Strikethrough } from "./built-in/Strikethrough";
import { Highlight } from "./built-in/Highlight";
import { Color } from "./built-in/Color";
import { FontSize } from "./built-in/FontSize";
import type { Command } from "prosemirror-state";
import type { NodeSpec, MarkSpec } from "prosemirror-model";
import type { FontModifier, MarkDecorator, ToolbarItemSpec } from "./types";

interface StarterKitOptions {
  /** Pass false to exclude this extension entirely */
  document?: false;
  paragraph?: false;
  heading?: false | { levels?: number[] };
  bold?: false | { shortcut?: boolean };
  italic?: false | { shortcut?: boolean };
  history?: false | { depth?: number; newGroupDelay?: number };
  underline?: false;
  strikethrough?: false;
  highlight?: false | { color?: string; multicolor?: boolean };
  color?: false | { colors?: string[] };
  fontSize?: false | { sizes?: number[] };
}

/**
 * StarterKit — batteries-included default for new editors.
 *
 * @example
 * new Editor({ extensions: [StarterKit] })
 * new Editor({ extensions: [StarterKit.configure({ history: false })] })
 * new Editor({ extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })] })
 * new Editor({ extensions: [StarterKit, Highlight, MyImageExtension] })
 */
export const StarterKit = Extension.create<StarterKitOptions>({
  name: "starterKit",

  addNodes() {
    const nodes: Record<string, NodeSpec> = {};
    const opts = this.options;

    if (opts.document !== false) {
      Object.assign(nodes, Document.resolve().nodes);
    }
    if (opts.paragraph !== false) {
      Object.assign(nodes, Paragraph.resolve().nodes);
    }
    if (opts.heading !== false) {
      const ext = typeof opts.heading === "object"
        ? Heading.configure(opts.heading)
        : Heading;
      Object.assign(nodes, ext.resolve().nodes);
    }

    return nodes;
  },

  addMarks() {
    const marks: Record<string, MarkSpec> = {};
    const opts = this.options;

    if (opts.bold !== false) {
      Object.assign(marks, Bold.resolve().marks);
    }
    if (opts.italic !== false) {
      Object.assign(marks, Italic.resolve().marks);
    }
    if (opts.underline !== false) {
      Object.assign(marks, Underline.resolve().marks);
    }
    if (opts.strikethrough !== false) {
      Object.assign(marks, Strikethrough.resolve().marks);
    }
    if (opts.highlight !== false) {
      const ext = typeof opts.highlight === "object" ? Highlight.configure(opts.highlight) : Highlight;
      Object.assign(marks, ext.resolve().marks);
    }
    if (opts.color !== false) {
      const ext = typeof opts.color === "object" ? Color.configure(opts.color) : Color;
      Object.assign(marks, ext.resolve().marks);
    }
    if (opts.fontSize !== false) {
      const ext = typeof opts.fontSize === "object" ? FontSize.configure(opts.fontSize) : FontSize;
      Object.assign(marks, ext.resolve().marks);
    }

    return marks;
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    if (opts.history === false) return [];

    const ext = typeof opts.history === "object"
      ? History.configure(opts.history)
      : History;
    return ext.resolve(this.schema).plugins;
  },

  addKeymap() {
    const km: Record<string, Command> = {};
    const opts = this.options;

    // BaseEditing is always included — Backspace + Delete are not optional
    Object.assign(km, BaseEditing.resolve(this.schema).keymap);

    if (opts.paragraph !== false) {
      Object.assign(km, Paragraph.resolve(this.schema).keymap);
    }
    if (opts.bold !== false) {
      const ext = typeof opts.bold === "object" ? Bold.configure(opts.bold) : Bold;
      Object.assign(km, ext.resolve(this.schema).keymap);
    }
    if (opts.italic !== false) {
      const ext = typeof opts.italic === "object" ? Italic.configure(opts.italic) : Italic;
      Object.assign(km, ext.resolve(this.schema).keymap);
    }
    if (opts.history !== false) {
      const ext = typeof opts.history === "object" ? History.configure(opts.history) : History;
      Object.assign(km, ext.resolve(this.schema).keymap);
    }
    if (opts.heading !== false) {
      const ext = typeof opts.heading === "object" ? Heading.configure(opts.heading) : Heading;
      Object.assign(km, ext.resolve(this.schema).keymap);
    }
    if (opts.underline !== false) {
      Object.assign(km, Underline.resolve(this.schema).keymap);
    }
    if (opts.strikethrough !== false) {
      Object.assign(km, Strikethrough.resolve(this.schema).keymap);
    }
    if (opts.highlight !== false) {
      const ext = typeof opts.highlight === "object" ? Highlight.configure(opts.highlight) : Highlight;
      Object.assign(km, ext.resolve(this.schema).keymap);
    }

    return km;
  },

  addCommands() {
    const cmds: Record<string, (...args: unknown[]) => Command> = {};
    const opts = this.options;

    if (opts.bold !== false) {
      const ext = typeof opts.bold === "object" ? Bold.configure(opts.bold) : Bold;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.italic !== false) {
      const ext = typeof opts.italic === "object" ? Italic.configure(opts.italic) : Italic;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.history !== false) {
      const ext = typeof opts.history === "object" ? History.configure(opts.history) : History;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.heading !== false) {
      const ext = typeof opts.heading === "object" ? Heading.configure(opts.heading) : Heading;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.underline !== false) {
      Object.assign(cmds, Underline.resolve(this.schema).commands);
    }
    if (opts.strikethrough !== false) {
      Object.assign(cmds, Strikethrough.resolve(this.schema).commands);
    }
    if (opts.highlight !== false) {
      const ext = typeof opts.highlight === "object" ? Highlight.configure(opts.highlight) : Highlight;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.color !== false) {
      const ext = typeof opts.color === "object" ? Color.configure(opts.color) : Color;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }
    if (opts.fontSize !== false) {
      const ext = typeof opts.fontSize === "object" ? FontSize.configure(opts.fontSize) : FontSize;
      Object.assign(cmds, ext.resolve(this.schema).commands);
    }

    return cmds;
  },

  addInputHandlers() {
    // BaseEditing is always included — arrow keys are not optional
    return BaseEditing.resolve().inputHandlers;
  },

  addFontModifiers() {
    const map = new Map<string, FontModifier>();
    const opts = this.options;

    if (opts.bold !== false) {
      const ext = typeof opts.bold === "object" ? Bold.configure(opts.bold) : Bold;
      for (const [k, v] of ext.resolve().fontModifiers) map.set(k, v);
    }
    if (opts.italic !== false) {
      const ext = typeof opts.italic === "object" ? Italic.configure(opts.italic) : Italic;
      for (const [k, v] of ext.resolve().fontModifiers) map.set(k, v);
    }
    if (opts.fontSize !== false) {
      const ext = typeof opts.fontSize === "object" ? FontSize.configure(opts.fontSize) : FontSize;
      for (const [k, v] of ext.resolve().fontModifiers) map.set(k, v);
    }

    return map;
  },

  addMarkDecorators() {
    const opts = this.options;
    const result: Record<string, MarkDecorator> = {};
    if (opts.underline !== false) {
      for (const [k, v] of Underline.resolve().markDecorators) result[k] = v;
    }
    if (opts.strikethrough !== false) {
      for (const [k, v] of Strikethrough.resolve().markDecorators) result[k] = v;
    }
    if (opts.highlight !== false) {
      const ext = typeof opts.highlight === "object" ? Highlight.configure(opts.highlight) : Highlight;
      for (const [k, v] of ext.resolve().markDecorators) result[k] = v;
    }
    if (opts.color !== false) {
      for (const [k, v] of Color.resolve().markDecorators) result[k] = v;
    }
    return result;
  },

  addToolbarItems() {
    const items: ToolbarItemSpec[] = [];
    const opts = this.options;

    if (opts.heading !== false) {
      const ext = typeof opts.heading === "object" ? Heading.configure(opts.heading) : Heading;
      items.push(...ext.resolve().toolbarItems);
    }
    if (opts.bold !== false) {
      const ext = typeof opts.bold === "object" ? Bold.configure(opts.bold) : Bold;
      items.push(...ext.resolve().toolbarItems);
    }
    if (opts.italic !== false) {
      const ext = typeof opts.italic === "object" ? Italic.configure(opts.italic) : Italic;
      items.push(...ext.resolve().toolbarItems);
    }
    if (opts.underline !== false) {
      items.push(...Underline.resolve().toolbarItems);
    }
    if (opts.strikethrough !== false) {
      items.push(...Strikethrough.resolve().toolbarItems);
    }
    if (opts.highlight !== false) {
      const ext = typeof opts.highlight === "object" ? Highlight.configure(opts.highlight) : Highlight;
      items.push(...ext.resolve().toolbarItems);
    }
    if (opts.color !== false) {
      const ext = typeof opts.color === "object" ? Color.configure(opts.color) : Color;
      items.push(...ext.resolve().toolbarItems);
    }
    if (opts.fontSize !== false) {
      const ext = typeof opts.fontSize === "object" ? FontSize.configure(opts.fontSize) : FontSize;
      items.push(...ext.resolve().toolbarItems);
    }

    return items;
  },
});
