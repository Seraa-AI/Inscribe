// ── Word-level diff ops ───────────────────────────────────────────────────────

/**
 * A word-level diff operation produced by computeAiSuggestion.
 *
 * Unlike the char-level expansion used for human track changes, AI suggestions
 * stay at word/token granularity so each group maps cleanly to one visible
 * replacement in the overlay (e.g. "regardless" → "concerning", not 20 chars).
 *
 * Every delete and insert carries a groupId that pairs them into a single
 * logical replacement. Accept/reject always operates on the full group.
 */
export type WordLevelOp =
  | { type: "keep";   text: string }
  | { type: "delete"; text: string; groupId: string }
  | { type: "insert"; text: string; groupId: string };

// ── Core serializable types ───────────────────────────────────────────────────

/**
 * One block's contribution to an AI suggestion.
 *
 * `acceptedText` is the block's text at the moment the suggestion was computed
 * (pending deletions excluded, pending insertions included — what the user sees).
 * It is stored so staleness can be detected later: if the live block's accepted
 * text no longer matches, the suggestion for this block is considered stale and
 * skipped during rendering and apply.
 */
export interface AiSuggestionBlock {
  /** Stable nodeId of the target block. */
  nodeId: string;
  /** Block text at compute time — used for stale detection. */
  acceptedText: string;
  /** Word-level diff ops (keep / delete / insert). No char-level expansion. */
  ops: WordLevelOp[];
}

/**
 * A complete AI suggestion — serializable plain JSON, safe to store in a DB.
 *
 * Computed by `ai.suggestions.compute()` (or the standalone
 * `computeAiSuggestion()` function). Passed to `ai.suggestions.show()` to
 * display as an overlay on the canvas without touching the document.
 */
export interface AiSuggestion {
  /** Unique suggestion id. */
  id: string;
  /** Author identifier shown in the popover, e.g. "AI Assistant". */
  authorID: string;
  /** One entry per block that has at least one change. */
  blocks: AiSuggestionBlock[];
  /** Unix timestamp (ms) when the suggestion was computed. */
  createdAt: number;
}

// ── Apply options ─────────────────────────────────────────────────────────────

export interface ApplyAiSuggestionOptions {
  /**
   * If provided, only ops belonging to this groupId are applied.
   * Omit to apply all pending groups in the suggestion.
   */
  groupId?: string;
  /**
   * "direct"  — apply as a plain document replacement (no tracking marks).
   * "tracked" — apply as tracked_insert / tracked_delete marks attributed
   *             to the suggestion's authorID, entering the human TC flow.
   */
  mode: "direct" | "tracked";
}

export interface ApplyAiResult {
  applied: boolean;
  /** Set when applied is false to explain why. */
  reason?: "not-found" | "stale" | "no-change";
}

export interface RejectAiSuggestionOptions {
  /**
   * If provided, only ops belonging to this groupId are rejected (removed
   * from the overlay). Omit to reject and hide the entire suggestion.
   */
  groupId?: string;
}

// ── Plugin state (internal — not part of serialized AiSuggestion) ─────────────

/**
 * Live plugin state stored in the ProseMirror plugin.
 * Not serialized — reconstructed each session from the saved AiSuggestion JSON.
 */
export interface AiSuggestionPluginState {
  /** The active suggestion, or null if none is showing. */
  suggestion: AiSuggestion | null;
  /**
   * nodeIds of blocks whose live acceptedText no longer matches
   * block.acceptedText. Stale blocks are skipped during rendering and apply.
   * Recomputed on every state change by the overlay handler.
   */
  staleBlockIds: ReadonlySet<string>;
}
