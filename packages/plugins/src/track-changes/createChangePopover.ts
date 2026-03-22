import type { IEditor } from "@inscribe/core";

import { trackChangesPluginKey } from "./engine/trackChangesPlugin";
import { CHANGE_OPERATION, CHANGE_STATUS } from "./types";

export interface ChangePopoverInfo {
  id: string;
  operation: CHANGE_OPERATION;
  authorID: string;
  status: CHANGE_STATUS;
  from: number;
  to: number;
}

export interface ChangePopoverCallbacks {
  onShow: (rect: DOMRect, info: ChangePopoverInfo) => void;
  onMove: (rect: DOMRect, info: ChangePopoverInfo) => void;
  onHide: () => void;
}

/**
 * createChangePopover — headless controller for an accept/reject popover.
 *
 * Subscribes to editor state changes and fires onShow/onMove/onHide whenever
 * the cursor lands inside a pending tracked change.
 *
 * @example
 *   const cleanup = createChangePopover(editor, {
 *     onShow: (rect, info) => { popover.style.display = "block"; ... },
 *     onMove: (rect, info) => { popover.style.top = rect.bottom + "px"; },
 *     onHide: () => { popover.style.display = "none"; },
 *   });
 */
export function createChangePopover(
  editor: IEditor,
  options: ChangePopoverCallbacks,
): () => void {
  const { onShow, onMove, onHide } = options;
  let visible = false;
  let lastId: string | null = null;

  function update() {
    const state = editor.getState();
    const pluginState = trackChangesPluginKey.getState(state);
    if (!pluginState) {
      if (visible) { visible = false; lastId = null; onHide(); }
      return;
    }

    const { head } = state.selection;
    const { changes } = pluginState.changeSet;

    // Find first pending change whose range contains the cursor
    const change = changes.find(
      c =>
        c.dataTracked.status === CHANGE_STATUS.pending &&
        head >= c.from &&
        head <= c.to,
    );

    if (!change) {
      if (visible) { visible = false; lastId = null; onHide(); }
      return;
    }

    const rect = editor.getViewportRect(change.from, change.to);
    if (!rect) {
      if (visible) { visible = false; lastId = null; onHide(); }
      return;
    }

    const info: ChangePopoverInfo = {
      id:        change.id,
      operation: change.dataTracked.operation as CHANGE_OPERATION,
      authorID:  change.dataTracked.authorID ?? "unknown",
      status:    change.dataTracked.status as CHANGE_STATUS,
      from:      change.from,
      to:        change.to,
    };

    if (visible && lastId === change.id) {
      onMove(rect, info);
    } else {
      visible = true;
      lastId = change.id;
      onShow(rect, info);
    }
  }

  const unsubscribe = editor.subscribe(update);

  return () => {
    unsubscribe();
    if (visible) { visible = false; lastId = null; onHide(); }
  };
}
