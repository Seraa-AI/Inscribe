/**
 * renderAiSuggestionOps
 *
 * Canvas rendering helpers for the AI suggestion overlay.
 *
 * Delete ops: reuse renderTrackedDelete (strikethrough + red wash) since the
 * visual language is identical — "this text would be removed".
 *
 * Insert ops: the inserted text does not yet exist in the document, so there
 * are no GlyphEntries in the CharacterMap. Instead we draw "phantom" inline
 * text at the insertion point coordinate using the same font as the surrounding
 * paragraph. renderAiInsert handles this.
 */

import type { GlyphEntry, LineEntry } from "@scrivr/core";
import { renderTrackedDelete, renderTrackedInsert } from "@scrivr/core";

import type { CharacterMap } from "@scrivr/core";
import { acceptedRangeToDocRange } from "../track-changes/lib/acceptedTextMap";
import type { PosMapEntry } from "../track-changes/lib/acceptedTextMap";
import type { WordLevelOp } from "./types";

// ── Render instruction types ──────────────────────────────────────────────────

export interface DeleteRenderInstruction {
  type:    "delete";
  groupId: string;
  glyphs:  GlyphEntry[];
  lines:   LineEntry[];
  color:   string;
}

export interface InsertRenderInstruction {
  type:       "insert";
  groupId:    string;
  text:       string;
  x:          number;
  y:          number;
  lineHeight: number;
  color:      string;
}

export type AiOpRenderInstruction = DeleteRenderInstruction | InsertRenderInstruction;

// ── Phantom insert renderer ───────────────────────────────────────────────────

/**
 * Draw phantom inline text for an AI suggestion insert.
 *
 * The text does not exist in the document yet — we paint it as a green
 * underlined string at the insertion point so the user can preview it.
 *
 * Font is intentionally kept at a sensible default ("14px sans-serif") rather
 * than trying to match the paragraph font; the paragraph font is not reliably
 * available at render time. Developers can override via options if needed.
 */
export function renderAiInsert(
  ctx: CanvasRenderingContext2D,
  inst: InsertRenderInstruction,
): void {
  const { text, x, y, lineHeight, color } = inst;
  if (!text) return;

  const fontSize   = Math.round(lineHeight * 0.75);
  const fontFamily = "sans-serif";
  const font       = `${fontSize}px ${fontFamily}`;

  ctx.save();

  ctx.font = font;
  const measured = ctx.measureText(text);
  const w = measured.width;

  // Subtle green background wash
  ctx.fillStyle = hexToRgba(color, 0.15);
  ctx.fillRect(x, y, w, lineHeight);

  // Text itself
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + lineHeight * 0.8);

  // Underline
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x,     y + lineHeight - 1);
  ctx.lineTo(x + w, y + lineHeight - 1);
  ctx.stroke();

  ctx.restore();
}

// ── Op → canvas instruction mapper ───────────────────────────────────────────

const DELETE_COLOR = "#dc2626"; // red-600
const INSERT_COLOR = "#16a34a"; // green-600

/**
 * Walk a block's WordLevelOp array and produce canvas rendering instructions
 * for each delete and insert op visible on `pageNumber`.
 *
 * @param ops         Word-level ops from AiSuggestionBlock.
 * @param map         Position map re-derived from the live block (via buildAcceptedTextMap).
 * @param charMap     The editor's CharacterMap for the current render frame.
 * @param pageNumber  The page currently being painted.
 */
export function buildOpRenderInstructions(
  ops: WordLevelOp[],
  map: PosMapEntry[],
  charMap: CharacterMap,
  pageNumber: number,
): AiOpRenderInstruction[] {
  const instructions: AiOpRenderInstruction[] = [];
  let acceptedOffset = 0;

  for (const op of ops) {
    if (op.type === "keep") {
      acceptedOffset += op.text.length;
      continue;
    }

    if (op.type === "delete") {
      const range = acceptedRangeToDocRange(map, acceptedOffset, acceptedOffset + op.text.length);
      if (range) {
        const glyphs = charMap.glyphsInRange(range.from, range.to).filter(g => g.page === pageNumber);
        const lines  = charMap.linesInRange(range.from, range.to).filter(l => l.page === pageNumber);
        if (glyphs.length > 0 || lines.length > 0) {
          instructions.push({ type: "delete", groupId: op.groupId, glyphs, lines, color: DELETE_COLOR });
        }
      }
      acceptedOffset += op.text.length;
      // Note: acceptedOffset advances for deletes (they consume accepted chars)
    } else {
      // insert — zero-width point in the accepted text
      const range = acceptedRangeToDocRange(map, acceptedOffset, acceptedOffset);
      if (range) {
        const coords = charMap.coordsAtPos(range.from, pageNumber);
        if (coords && coords.page === pageNumber) {
          // Get line height from the LineEntry at the insertion point
          const lines = charMap.linesInRange(
            Math.max(0, range.from - 1),
            range.from + 1,
          ).filter(l => l.page === pageNumber);
          const lineHeight = lines[0]?.height ?? 20;

          instructions.push({
            type:       "insert",
            groupId:    op.groupId,
            text:       op.text,
            x:          coords.x,
            y:          coords.y,
            lineHeight,
            color:      INSERT_COLOR,
          });
        }
      }
      // insert does NOT advance acceptedOffset — inserts add new chars, don't consume accepted ones
    }
  }

  return instructions;
}

// ── Render dispatcher ─────────────────────────────────────────────────────────

/**
 * Render all instructions for one block onto the canvas overlay.
 * Deduplicates glyphs/lines by position (same pattern as TrackChanges.ts) to
 * prevent double-painting when multiple ops touch the same range.
 */
export function renderInstructions(
  ctx: CanvasRenderingContext2D,
  instructions: AiOpRenderInstruction[],
): void {
  // Collect and deduplicate deletes by docPos
  const deleteGlyphs = new Map<number, { glyph: GlyphEntry; color: string }>();
  const deleteLines  = new Map<number, { line: LineEntry;  color: string }>();

  for (const inst of instructions) {
    if (inst.type === "delete") {
      for (const g of inst.glyphs) {
        if (!deleteGlyphs.has(g.docPos)) deleteGlyphs.set(g.docPos, { glyph: g, color: inst.color });
      }
      for (const l of inst.lines) {
        if (!deleteLines.has(l.lineIndex)) deleteLines.set(l.lineIndex, { line: l, color: inst.color });
      }
    }
  }

  // Render deletes grouped by color
  if (deleteGlyphs.size > 0 || deleteLines.size > 0) {
    const byColor = new Map<string, { glyphs: GlyphEntry[]; lines: LineEntry[] }>();
    for (const { glyph, color } of deleteGlyphs.values()) {
      if (!byColor.has(color)) byColor.set(color, { glyphs: [], lines: [] });
      byColor.get(color)!.glyphs.push(glyph);
    }
    for (const { line, color } of deleteLines.values()) {
      if (!byColor.has(color)) byColor.set(color, { glyphs: [], lines: [] });
      byColor.get(color)!.lines.push(line);
    }
    for (const [color, { glyphs, lines }] of byColor) {
      renderTrackedDelete(ctx, glyphs, lines, color);
    }
  }

  // Render inserts (phantom text) — drawn after deletes so they appear on top
  for (const inst of instructions) {
    if (inst.type === "insert") {
      renderAiInsert(ctx, inst);
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
