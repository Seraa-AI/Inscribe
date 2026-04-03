import { Plugin, PluginKey } from "prosemirror-state";
import type { AiSuggestion, AiSuggestionPluginState } from "./types";

// ── Plugin key ────────────────────────────────────────────────────────────────

export const aiSuggestionPluginKey = new PluginKey<AiSuggestionPluginState>(
  "aiSuggestion",
);

// ── Meta action keys ──────────────────────────────────────────────────────────

/** Set on a transaction to show a suggestion: `tr.setMeta(AI_SUGGESTION_SHOW, suggestion)` */
export const AI_SUGGESTION_SHOW = "aiSuggestion:show";

/** Set on a transaction to hide the current suggestion: `tr.setMeta(AI_SUGGESTION_HIDE, true)` */
export const AI_SUGGESTION_HIDE = "aiSuggestion:hide";

// ── Initial state ─────────────────────────────────────────────────────────────

const EMPTY_STATE: AiSuggestionPluginState = {
  suggestion:    null,
  staleBlockIds: new Set(),
};

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * ProseMirror plugin that holds the active AiSuggestion in its state.
 *
 * The suggestion is pure JSON — no live doc positions are stored here.
 * The overlay handler re-derives doc positions on every render tick by calling
 * buildAcceptedTextMap() on the live block, which is always correct even after
 * the user has edited the document.
 *
 * Staleness (staleBlockIds) is NOT tracked here — it is computed by the overlay
 * handler on each render using the live accepted text. Storing it in plugin state
 * would require mapping it through every transaction, adding unnecessary complexity.
 */
export function createAiSuggestionPlugin(): Plugin<AiSuggestionPluginState> {
  return new Plugin<AiSuggestionPluginState>({
    key: aiSuggestionPluginKey,

    state: {
      init(): AiSuggestionPluginState {
        return EMPTY_STATE;
      },

      apply(tr, prev): AiSuggestionPluginState {
        const showMeta = tr.getMeta(AI_SUGGESTION_SHOW) as AiSuggestion | undefined;
        if (showMeta) {
          return { suggestion: showMeta, staleBlockIds: new Set() };
        }

        if (tr.getMeta(AI_SUGGESTION_HIDE)) {
          return EMPTY_STATE;
        }

        // No suggestion-related meta — carry state forward unchanged.
        // We intentionally do NOT map positions through tr.mapping because
        // we don't store positions. The overlay re-derives them each frame.
        return prev;
      },
    },
  });
}
