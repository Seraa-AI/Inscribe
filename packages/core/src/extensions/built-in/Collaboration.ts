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
import type { Plugin, Command, Transaction, EditorState } from "prosemirror-state";
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
 * The structural subset of EditorView that ySyncPlugin actually uses:
 *   • view.state      — read on every Y.js update to access plugin state
 *   • view.dispatch() — called to push Y.js changes into ProseMirror
 *
 * Defining this explicitly lets us pass our lightweight shim without `any`.
 * The single cast on the plugin.spec.view call is the only trust boundary.
 */
interface SyncViewShim {
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
}

interface SyncPluginView {
  update?(view: SyncViewShim, prevState: EditorState): void;
  destroy?(): void;
}

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

    // Lightweight shim satisfying the SyncViewShim contract
    const shim: SyncViewShim = {
      get state() { return editor.getState(); },
      dispatch: (tr: Transaction) => editor._applyTransaction(tr),
    };

    // Manually initialise the plugin view (normally done by EditorView constructor).
    // One structural cast here: ySyncPlugin expects a full EditorView but only
    // reads state + dispatch — our shim satisfies both.
    const viewFactory = syncPlugin.spec.view as
      | ((view: SyncViewShim) => SyncPluginView)
      | undefined;
    const pluginView = viewFactory?.(shim);

    // Keep the shim current after every local dispatch so the plugin view sees
    // the latest state when it next needs to apply a Y.js change
    const unsubscribe = editor.subscribe(() => {
      pluginView?.update?.(shim, shim.state);
    });

    return () => {
      unsubscribe();
      pluginView?.destroy?.();
      provider.destroy();
    };
  },
});
