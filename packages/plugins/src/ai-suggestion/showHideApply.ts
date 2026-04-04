/**
 * showHideApply — public command functions for the AI suggestion system.
 *
 * These are standalone functions (not extension commands) so application code
 * can import and call them directly. They are also exposed through AiToolkitAPI
 * via the ai.suggestions namespace.
 */

import type { EditorState, Transaction } from "prosemirror-state";

import { findNodeById } from "../ai-toolkit/UniqueId";
import { applyMultiBlockDiff } from "../track-changes/lib/applyDiffAsSuggestion";
import { buildAcceptedTextMap, acceptedRangeToDocRange } from "../track-changes/lib/acceptedTextMap";
import { AI_SUGGESTION_HIDE, AI_SUGGESTION_SHOW, aiSuggestionPluginKey } from "./AiSuggestionPlugin";
import type {
  AiSuggestion,
  AiSuggestionBlock,
  ApplyAiResult,
  ApplyAiSuggestionOptions,
  RejectAiSuggestionOptions,
  WordLevelOp,
} from "./types";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Check whether a block's live accepted text still matches the text captured
 * at suggestion-compute time. Returns true if the block is stale.
 */
function isBlockStale(state: EditorState, block: AiSuggestionBlock): boolean {
  const found = findNodeById(state.doc, block.nodeId);
  if (!found) return true; // node no longer exists → treat as stale
  const { acceptedText } = buildAcceptedTextMap(found.node, found.pos, state.schema);
  return acceptedText !== block.acceptedText;
}

/**
 * Reconstruct the "proposed text" for a block from its WordLevelOp array.
 * The proposed text is the accepted text with deletes removed and inserts applied:
 * keeps + inserts, in order.
 */
function opsToProposedText(ops: WordLevelOp[]): string {
  return ops
    .filter(op => op.type !== "delete")
    .map(op => op.text)
    .join("");
}

/**
 * Filter ops to only those belonging to a specific groupId.
 * For ops NOT in the group, convert them to "keep" so the rest of the text
 * is preserved when only one group is applied.
 */
function filterOpsByGroup(ops: WordLevelOp[], groupId: string): WordLevelOp[] {
  return ops.map(op => {
    if (op.type === "keep") return op;
    if (op.groupId === groupId) return op;
    // Op belongs to a different group — treat as keep (preserve the text)
    if (op.type === "delete") return { type: "keep" as const, text: op.text };
    // Insert ops not in this group are dropped (they add new text we don't want)
    return null;
  }).filter((op): op is WordLevelOp => op !== null);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Display an AI suggestion as an overlay on the canvas.
 * The document is NOT modified — the suggestion is stored in plugin state only.
 *
 * @example
 * showAiSuggestion(state, dispatch, suggestion);
 */
export function showAiSuggestion(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  suggestion: AiSuggestion,
): void {
  dispatch(
    state.tr
      .setMeta(AI_SUGGESTION_SHOW, suggestion)
      .setMeta("addToHistory", false),
  );
}

/**
 * Hide the current AI suggestion overlay.
 * The document is NOT modified.
 */
export function hideAiSuggestion(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
): void {
  dispatch(
    state.tr
      .setMeta(AI_SUGGESTION_HIDE, true)
      .setMeta("addToHistory", false),
  );
}

/**
 * Apply the current AI suggestion (or a specific group within it) to the document.
 *
 * @param options.groupId  If provided, only the ops with this groupId are applied.
 *                         Other groups remain visible in the overlay.
 * @param options.mode     "direct"  — plain replace, no tracking marks.
 *                         "tracked" — applies as tracked_insert/delete marks,
 *                                     entering the human track-changes flow.
 *
 * @returns { applied, reason } — applied is false with a reason if the
 *          suggestion is missing, stale, or produces no change.
 */
export function applyAiSuggestion(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  options: ApplyAiSuggestionOptions,
): ApplyAiResult {
  const pluginState = aiSuggestionPluginKey.getState(state);
  if (!pluginState?.suggestion) {
    return { applied: false, reason: "not-found" };
  }

  const { suggestion } = pluginState;
  const { groupId, mode } = options;

  // Validate staleness for all affected blocks before touching the document.
  const affectedBlocks = suggestion.blocks.filter(block => {
    if (!groupId) return true; // applying all — check every block
    return block.ops.some(op => op.type !== "keep" && op.groupId === groupId);
  });

  for (const block of affectedBlocks) {
    if (isBlockStale(state, block)) {
      return { applied: false, reason: "stale" };
    }
  }

  if (affectedBlocks.length === 0) {
    return { applied: false, reason: "no-change" };
  }

  if (mode === "tracked") {
    // Reconstruct proposedText per block and delegate to applyMultiBlockDiff.
    // applyMultiBlockDiff re-diffs internally (same tokenizer + pairReplacements),
    // so the result is identical to what computeAiSuggestion produced.
    const blocksForDiff = affectedBlocks.map(block => {
      const filteredOps = groupId ? filterOpsByGroup(block.ops, groupId) : block.ops;
      return {
        nodeId:       block.nodeId,
        proposedText: opsToProposedText(filteredOps),
      };
    });

    // Intercept dispatch to inject AI_SUGGESTION_HIDE into the same transaction.
    // This is critical: if we called hideAiSuggestion(state, dispatch) separately
    // after applyMultiBlockDiff, the hide transaction would be built from the old
    // `state`, whose tr.doc is the pre-change doc, reverting the tracked marks.
    const dispatchWithHide = (tr: Transaction) => {
      tr.setMeta(AI_SUGGESTION_HIDE, true);
      dispatch(tr);
    };

    const result = applyMultiBlockDiff(state, dispatchWithHide, {
      blocks:   blocksForDiff,
      authorID: suggestion.authorID,
    });

    if (!result.applied) return { applied: false, reason: "no-change" };
    return { applied: true };
  }

  // mode === "direct": plain ProseMirror replace, no tracking marks.
  // Process blocks in reverse document order so applying a later block
  // does not shift positions of earlier blocks in the same transaction.
  const tr = state.tr;

  const sortedBlocks = [...affectedBlocks].sort((a, b) => {
    const posA = findNodeById(state.doc, a.nodeId)?.pos ?? 0;
    const posB = findNodeById(state.doc, b.nodeId)?.pos ?? 0;
    return posB - posA; // descending
  });

  let anyApplied = false;

  for (const block of sortedBlocks) {
    const found = findNodeById(tr.doc, block.nodeId);
    if (!found) continue;

    const { map } = buildAcceptedTextMap(found.node, found.pos, state.schema);

    const filteredOps = groupId ? filterOpsByGroup(block.ops, groupId) : block.ops;
    const proposedText = opsToProposedText(filteredOps);

    // Replace the full accepted-text range with proposedText.
    const fullRange = acceptedRangeToDocRange(map, 0, block.acceptedText.length);
    if (!fullRange) continue;

    const schema = state.schema;
    const textNode = proposedText
      ? schema.text(proposedText.replace(/\n/g, " "))
      : null;

    if (textNode) {
      tr.replaceWith(fullRange.from, fullRange.to, textNode);
    } else {
      tr.delete(fullRange.from, fullRange.to);
    }
    anyApplied = true;
  }

  if (!anyApplied) return { applied: false, reason: "no-change" };

  tr.setMeta("addToHistory", true)
    .setMeta(AI_SUGGESTION_HIDE, true);
  dispatch(tr);
  return { applied: true };
}

/**
 * Reject (discard) the current AI suggestion without modifying the document.
 * If a groupId is provided, only that group is discarded; the remaining groups
 * stay visible. If no groupId is provided, the entire suggestion is hidden.
 *
 * Note: per-group rejection (partial hide) rebuilds the suggestion with the
 * rejected group's ops converted to keeps, then re-shows it. This means the
 * overlay re-renders without the rejected group.
 */
export function rejectAiSuggestion(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  options?: RejectAiSuggestionOptions,
): void {
  const { groupId } = options ?? {};

  if (!groupId) {
    // Reject everything — just hide.
    hideAiSuggestion(state, dispatch);
    return;
  }

  // Per-group rejection: rebuild the suggestion without that group's ops.
  const pluginState = aiSuggestionPluginKey.getState(state);
  if (!pluginState?.suggestion) return;

  const { suggestion } = pluginState;

  // Remove the rejected group from each block's ops.
  const updatedBlocks = suggestion.blocks.map(block => ({
    ...block,
    ops: block.ops.map((op): WordLevelOp => {
      if (op.type === "keep") return op;
      if (op.groupId !== groupId) return op;
      // Convert rejected delete/insert to keep — preserve the original text.
      if (op.type === "delete") return { type: "keep", text: op.text };
      // Drop rejected inserts (they add new text that's been rejected).
      return null as unknown as WordLevelOp;
    }).filter((op): op is WordLevelOp => op !== null),
  }));

  // If all blocks are now keep-only, just hide.
  const anyChange = updatedBlocks.some(b =>
    b.ops.some(op => op.type !== "keep"),
  );

  if (!anyChange) {
    hideAiSuggestion(state, dispatch);
    return;
  }

  // Re-show the trimmed suggestion.
  const trimmedSuggestion: AiSuggestion = { ...suggestion, blocks: updatedBlocks };
  showAiSuggestion(state, dispatch, trimmedSuggestion);
}
