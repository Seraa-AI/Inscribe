import { Extension } from "./Extension";
import { Document } from "./built-in/Document";
import { Paragraph } from "./built-in/Paragraph";
import { Heading } from "./built-in/Heading";
import { Bold } from "./built-in/Bold";
import { Italic } from "./built-in/Italic";
import { History } from "./built-in/History";

interface StarterKitOptions {
  /** Pass false to exclude, or an options object to configure */
  document?: false;
  paragraph?: false;
  heading?: false | { levels?: number[] };
  bold?: false | { shortcut?: boolean };
  italic?: false | { shortcut?: boolean };
  history?: false | { depth?: number; newGroupDelay?: number };
}

/**
 * StarterKit — batteries-included default for new editors.
 *
 * Bundles the essential extensions so consumers don't have to list them
 * individually. Any extension can be disabled or configured via options.
 *
 * @example
 * // Minimal editor
 * new Editor({ extensions: [StarterKit] })
 *
 * // Disable undo/redo (e.g. collaborative editing where server owns history)
 * new Editor({ extensions: [StarterKit.configure({ history: false })] })
 *
 * // Only h1, h2, h3
 * new Editor({ extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })] })
 *
 * // Add custom extensions alongside StarterKit
 * new Editor({ extensions: [StarterKit, Highlight, MyImageExtension] })
 */
export const StarterKit = Extension.create<StarterKitOptions>({
  name: "starterKit",

  defaultOptions: {
    document: undefined,
    paragraph: undefined,
    heading: undefined,
    bold: undefined,
    italic: undefined,
    history: undefined,
  },

  addNodes() {
    const nodes: Record<string, object> = {};
    const opts = this.options;

    if (opts.document !== false) {
      Object.assign(nodes, Document.resolve().nodes);
    }
    if (opts.paragraph !== false) {
      Object.assign(nodes, Paragraph.resolve().nodes);
    }
    if (opts.heading !== false) {
      const headingExt =
        opts.heading && opts.heading !== false
          ? Heading.configure(opts.heading)
          : Heading;
      Object.assign(nodes, headingExt.resolve().nodes);
    }

    return nodes;
  },

  addMarks() {
    const marks: Record<string, object> = {};
    const opts = this.options;

    if (opts.bold !== false) {
      Object.assign(marks, Bold.resolve().marks);
    }
    if (opts.italic !== false) {
      Object.assign(marks, Italic.resolve().marks);
    }

    return marks;
  },

  addProseMirrorPlugins() {
    const plugins = [];
    const opts = this.options;

    if (opts.history !== false) {
      const historyExt =
        opts.history && opts.history !== false
          ? History.configure(opts.history)
          : History;
      plugins.push(...historyExt.resolve(this.schema).plugins);
    }

    return plugins;
  },

  addKeymap() {
    const km: Record<string, unknown> = {};
    const opts = this.options;

    if (opts.paragraph !== false) {
      Object.assign(km, Paragraph.resolve(this.schema).keymap);
    }
    if (opts.bold !== false) {
      const boldExt =
        opts.bold && opts.bold !== false ? Bold.configure(opts.bold) : Bold;
      Object.assign(km, boldExt.resolve(this.schema).keymap);
    }
    if (opts.italic !== false) {
      const italicExt =
        opts.italic && opts.italic !== false
          ? Italic.configure(opts.italic)
          : Italic;
      Object.assign(km, italicExt.resolve(this.schema).keymap);
    }
    if (opts.history !== false) {
      const historyExt =
        opts.history && opts.history !== false
          ? History.configure(opts.history)
          : History;
      Object.assign(km, historyExt.resolve(this.schema).keymap);
    }

    return km as Record<string, import("prosemirror-state").Command>;
  },

  addCommands() {
    const cmds: Record<string, unknown> = {};
    const opts = this.options;

    if (opts.bold !== false) {
      Object.assign(cmds, Bold.resolve(this.schema).commands);
    }
    if (opts.italic !== false) {
      Object.assign(cmds, Italic.resolve(this.schema).commands);
    }
    if (opts.history !== false) {
      Object.assign(cmds, History.resolve(this.schema).commands);
    }

    return cmds as Record<string, (...args: unknown[]) => import("prosemirror-state").Command>;
  },
});
