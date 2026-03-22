import { Extension, renderTrackedInsert, renderTrackedDelete } from "@inscribe/core";
import type { IEditor, OverlayRenderHandler } from "@inscribe/core";

import { setAction, TrackChangesAction } from "./actions";
import { trackChangesPlugin, trackChangesPluginKey } from "./engine/trackChangesPlugin";
import { CHANGE_OPERATION, CHANGE_STATUS, TrackChangesOptions, TrackChangesStatus } from "./types";

/**
 * Insert palette — greens. Each author gets a distinct shade.
 * renderTrackedInsert uses these as hex so hexToRgba applies correctly.
 */
const INSERT_COLORS = ["#15803d", "#0f766e", "#1d4ed8", "#7c3aed", "#0369a1", "#065f46"];

/**
 * Delete palette — reds/pinks. Each author gets a distinct shade.
 */
const DELETE_COLORS = ["#b91c1c", "#be185d", "#c2410c", "#a16207", "#7f1d1d", "#9d174d"];

function authorIndex(authorID: string): number {
  let hash = 0;
  for (let i = 0; i < authorID.length; i++) {
    hash = (hash * 31 + authorID.charCodeAt(i)) >>> 0;
  }
  return hash % INSERT_COLORS.length;
}

function insertColor(authorID: string): string {
  return INSERT_COLORS[authorIndex(authorID)]!;
}

function deleteColor(authorID: string): string {
  return DELETE_COLORS[authorIndex(authorID)]!;
}

/**
 * TrackChanges — opt-in track-changes plugin for @inscribe/plugins.
 *
 * Adds `tracked_insert` and `tracked_delete` marks to the schema (opt-in),
 * intercepts all transactions via appendTransaction, and exposes commands
 * for toggling tracking status and accepting/rejecting changes.
 *
 * Commands:
 *   setTrackingStatus(status?)  — toggle or set tracking status
 *   setChangeStatuses(status, ids) — accept or reject changes (gated by canAcceptReject)
 *   setTrackChangesUserID(userID) — update the current user ID
 *   refreshChanges()             — force-rebuild the ChangeSet
 */
export const TrackChanges = Extension.create<TrackChangesOptions>({
  name: "trackChanges",

  defaultOptions: {
    initialStatus: TrackChangesStatus.disabled,
    userID: "anonymous:Anonymous",
    canAcceptReject: false,
  },

  addMarks() {
    return {
      tracked_insert: {
        attrs: {
          dataTracked: { default: null },
        },
        inclusive: false,
        parseDOM: [{ tag: "ins[data-tracked]" }],
        toDOM() {
          return ["ins", { "data-tracked": "insert" }, 0];
        },
      },
      tracked_delete: {
        attrs: {
          dataTracked: { default: null },
        },
        inclusive: false,
        parseDOM: [{ tag: "del[data-tracked]" }],
        toDOM() {
          return ["del", { "data-tracked": "delete" }, 0];
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const { userID } = this.options;
    const opts: TrackChangesOptions = { userID };
    if (this.options.initialStatus !== undefined) opts.initialStatus = this.options.initialStatus;
    if (this.options.canAcceptReject !== undefined) opts.canAcceptReject = this.options.canAcceptReject;
    if (this.options.skipTrsWithMetas !== undefined) opts.skipTrsWithMetas = this.options.skipTrsWithMetas;
    return [
      trackChangesPlugin(opts),
    ];
  },

  addCommands() {
    return {
      setTrackingStatus:
        (...args: unknown[]) =>
        (state: import("prosemirror-state").EditorState, dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined) => {
          const status = args[0] as TrackChangesStatus | undefined;
          const currentStatus = trackChangesPluginKey.getState(state)?.status;
          if (!currentStatus) return false;

          let newStatus = status;
          if (newStatus === undefined) {
            newStatus =
              currentStatus === TrackChangesStatus.enabled
                ? TrackChangesStatus.disabled
                : TrackChangesStatus.enabled;
          }

          dispatch?.(
            setAction(state.tr, TrackChangesAction.setPluginStatus, newStatus),
          );

          return true;
        },

      setChangeStatuses:
        (...args: unknown[]) =>
        (state: import("prosemirror-state").EditorState, dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined) => {
          const status = args[0] as CHANGE_STATUS;
          const ids = args[1] as string[];
          const pluginState = trackChangesPluginKey.getState(state);
          if (!pluginState?.canAcceptReject) return false;

          dispatch?.(
            setAction(state.tr, TrackChangesAction.setChangeStatuses, {
              status,
              ids,
            }),
          );
          return true;
        },

      setTrackChangesUserID:
        (...args: unknown[]) =>
        (state: import("prosemirror-state").EditorState, dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined) => {
          const userID = args[0] as string;
          dispatch?.(setAction(state.tr, TrackChangesAction.setUserID, userID));
          return true;
        },

      refreshChanges:
        (..._args: unknown[]) =>
        (state: import("prosemirror-state").EditorState, dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined) => {
          dispatch?.(
            setAction(state.tr, TrackChangesAction.refreshChanges, true),
          );
          return true;
        },
    };
  },

  onEditorReady(editor: IEditor) {
    const handler: OverlayRenderHandler = (ctx, pageNumber, _pageConfig, charMap) => {
      const state = editor.getState();
      const pluginState = trackChangesPluginKey.getState(state);
      if (!pluginState) return;

      const { changeSet } = pluginState;

      for (const change of changeSet.changes) {
        const { operation, authorID } = change.dataTracked;
        const author = authorID ?? "unknown";

        const glyphs = charMap.glyphsInRange(change.from, change.to)
          .filter(g => g.page === pageNumber);
        const lines = charMap.linesInRange(change.from, change.to)
          .filter(l => l.page === pageNumber);

        if (glyphs.length === 0 && lines.length === 0) continue;

        if (operation === CHANGE_OPERATION.insert || operation === CHANGE_OPERATION.move) {
          renderTrackedInsert(ctx, glyphs, lines, insertColor(author));
        } else if (operation === CHANGE_OPERATION.delete) {
          renderTrackedDelete(ctx, glyphs, lines, deleteColor(author));
        }
      }
    };

    return editor.addOverlayRenderHandler(handler);
  },
});
