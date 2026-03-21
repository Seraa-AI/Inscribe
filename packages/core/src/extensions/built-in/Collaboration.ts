/**
 * Collaboration — real-time multi-user editing via Y.js + HocusPocus.
 *
 * Adds `ySyncPlugin` + `yUndoPlugin` to the ProseMirror plugin set so the
 * document is backed by a Y.XmlFragment CRDT.  On editor ready it connects
 * to the HocusPocus WebSocket server and initialises the Y.js ↔ ProseMirror
 * sync loop via a lightweight EditorView shim.
 *
 * Usage:
 *   new Editor({
 *     extensions: [
 *       StarterKit.configure({ history: false }), // disable PM history
 *       Collaboration.configure({ url: "ws://localhost:1234", name: "my-room" }),
 *       CollaborationCursor.configure({ user: { name: "Alice", color: "#ef4444" } }),
 *     ],
 *   })
 *
 * ⚠  Disable the History extension when using Collaboration — yUndoPlugin
 *    replaces it with a Y.js-aware undo manager.
 */
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { ySyncPlugin, yUndoPlugin, yUndoPluginKey, undo, redo } from "y-prosemirror";
import type { Plugin, Command } from "prosemirror-state";
import { Extension } from "../Extension";
import type { IEditor } from "../types";
import { collaborationRegistry } from "../collaborationState";

interface CollaborationOptions {
  /** WebSocket URL of the HocusPocus server. Default: "ws://localhost:1234" */
  url?: string;
  /** Document / room name — all clients with the same name share the document. */
  name?: string;
}

/**
 * Per-instance state shared between addProseMirrorPlugins() and onEditorReady().
 * Keyed by the options object (unique per configured Extension instance).
 */
interface InstanceState {
  ydoc: Y.Doc;
  type: Y.XmlFragment;
  syncPlugin: Plugin;
}
const instanceState = new WeakMap<object, InstanceState>();

/**
 * Y.js-aware undo/redo commands.
 *
 * y-prosemirror's undo/redo operate on the Y.js UndoManager directly (not via
 * ProseMirror dispatch), so they only revert the local client's own changes —
 * remote peers' changes are never undone.
 */
const yUndo: Command = (state) => {
  const pluginState = yUndoPluginKey.getState(state);
  if (!pluginState?.undoManager || pluginState.undoManager.undoStack.length === 0) return false;
  return undo(state);
};

const yRedo: Command = (state) => {
  const pluginState = yUndoPluginKey.getState(state);
  if (!pluginState?.undoManager || pluginState.undoManager.redoStack.length === 0) return false;
  return redo(state);
};

export const Collaboration = Extension.create<CollaborationOptions>({
  name: "collaboration",

  defaultOptions: {
    url: "ws://localhost:1234",
    name: "default",
  },

  addProseMirrorPlugins() {
    const ydoc = new Y.Doc();
    const type = ydoc.getXmlFragment("prosemirror");
    const syncPlugin = ySyncPlugin(type);

    // Persist for onEditorReady — options object is stable per configure() call
    instanceState.set(this.options, { ydoc, type, syncPlugin });

    return [syncPlugin, yUndoPlugin()];
  },

  addKeymap() {
    return {
      "Mod-z": yUndo,
      "Mod-y": yRedo,
      "Mod-Shift-z": yRedo,
    };
  },

  addCommands() {
    return {
      undo: () => yUndo,
      redo: () => yRedo,
    };
  },

  onEditorReady(editor: IEditor) {
    const inst = instanceState.get(this.options);
    if (!inst) return;

    const { ydoc, syncPlugin } = inst;
    const { url = "ws://localhost:1234", name = "default" } = this.options;

    const provider = new HocuspocusProvider({ url, name, document: ydoc });

    // Store provider so CollaborationCursor can read awareness
    collaborationRegistry.set(editor as object, { ydoc, provider });

    /**
     * Minimal EditorView shim — enough for ySyncPlugin's view to function.
     *
     * YSyncPluginView only needs:
     *   • view.state      — latest EditorState (via getter, always current)
     *   • view.dispatch() — to apply incoming Y.js changes as PM transactions
     */
    const shim = {
      get state() {
        return (editor as unknown as { getState(): ReturnType<IEditor["getState"]> }).getState();
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dispatch: (tr: any) => editor._applyTransaction(tr),
    };

    // Manually initialise the plugin view (normally done by EditorView constructor)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginView = syncPlugin.spec.view?.(shim as any);

    // Keep the shim current after every local dispatch so the plugin view sees
    // the latest state when it next needs to apply a Y.js change
    const unsubscribe = editor.subscribe(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pluginView?.update?.(shim as any, shim.state);
    });

    return () => {
      unsubscribe();
      pluginView?.destroy?.();
      provider.destroy();
    };
  },
});
