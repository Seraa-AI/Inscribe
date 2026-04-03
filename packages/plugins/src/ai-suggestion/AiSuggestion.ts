import { Extension } from "@scrivr/core";
import type { CharacterMap, IEditor, OverlayRenderHandler } from "@scrivr/core";

import { findNodeById } from "../ai-toolkit/UniqueId";
import { buildAcceptedTextMap } from "../track-changes/lib/acceptedTextMap";
import { createAiSuggestionPlugin, aiSuggestionPluginKey } from "./AiSuggestionPlugin";
import { buildOpRenderInstructions, renderInstructions } from "./renderAiSuggestionOps";

// ── Extension ─────────────────────────────────────────────────────────────────

/**
 * AiSuggestion — opt-in extension that renders AI-proposed changes as a canvas
 * overlay without touching the ProseMirror document.
 *
 * Typically bundled inside AiToolkit (when aiSuggestion option is enabled), but
 * can also be added standalone:
 *
 * @example
 * const editor = new Editor({
 *   extensions: [StarterKit, AiSuggestion],
 * });
 *
 * // Then use via AiToolkitAPI:
 * const ai = getAiToolkit(editor);
 * const s = ai.suggestions.compute({ blocks, authorID: "AI" });
 * if (s) ai.suggestions.show(s);
 *
 * // Or use standalone functions:
 * import { computeAiSuggestion, showAiSuggestion } from "@scrivr/plugins";
 */
export const AiSuggestion = Extension.create({
  name: "aiSuggestion",

  addProseMirrorPlugins() {
    return [createAiSuggestionPlugin()];
  },

  onEditorReady(editor: IEditor) {
    const handler: OverlayRenderHandler = (
      ctx,
      pageNumber,
      _pageConfig,
      charMap: CharacterMap,
    ) => {
      const state       = editor.getState();
      const pluginState = aiSuggestionPluginKey.getState(state);
      if (!pluginState?.suggestion) return;

      const { suggestion } = pluginState;
      const schema = state.schema;

      for (const block of suggestion.blocks) {
        const found = findNodeById(state.doc, block.nodeId);
        if (!found) continue;

        // Re-derive the position map from the live document on every render.
        // This is the key property of the architecture: we never store live
        // positions, so even if the user edits the document, the overlay
        // always paints in the correct position as long as acceptedText matches.
        const { acceptedText: liveText, map } = buildAcceptedTextMap(
          found.node,
          found.pos,
          schema,
        );

        // Skip stale blocks silently — the popover controller can surface a
        // "suggestion may be outdated" notice via a separate callback.
        if (liveText !== block.acceptedText) continue;

        const instructions = buildOpRenderInstructions(
          block.ops,
          map,
          charMap,
          pageNumber,
        );

        renderInstructions(ctx, instructions);
      }
    };

    return editor.addOverlayRenderHandler(handler);
  },
});
