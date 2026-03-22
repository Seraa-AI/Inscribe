/**
 * splitRangeForNewMark
 *
 * Applies a new tracked mark (tracked_insert or tracked_delete) to [from, to)
 * in the document, respecting multi-author coexistence:
 *
 *   1. Walk every text node in [from, to).
 *   2. For each node that already carries a tracked mark from a DIFFERENT author:
 *      a. The overlapping sub-range gets BOTH marks (allowed because excludes:"").
 *      b. Both the existing mark's dataTracked AND the new mark's dataTracked get
 *         `isConflict: true`.
 *   3. For each node that already carries the SAME author's mark of the same type,
 *      skip — same-author duplicate (mark bloat). The existing mark wins.
 *   4. Apply the new mark to all ranges where it is not a duplicate.
 *
 * The function mutates the provided transaction and returns it so callers
 * can chain.
 *
 * NOTE: This function does NOT split text nodes at boundaries. ProseMirror's
 * addMark() handles that internally — it already splits nodes as needed.
 * What we add is the conflict-detection and isConflict flag propagation.
 */

import type { Mark, MarkType, Node as PMNode, Schema } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

export interface SplitRangeOptions {
  /** The mark to apply (already created with .create({dataTracked: ...})). */
  mark: Mark;
  /** Absolute doc position of range start (inclusive). */
  from: number;
  /** Absolute doc position of range end (exclusive). */
  to: number;
  schema: Schema;
}

/**
 * Apply `mark` to [from, to), detecting and flagging conflicts with existing
 * tracked marks from other authors.
 *
 * Returns true if any conflict was detected.
 */
export function splitRangeForNewMark(
  tr: Transaction,
  { mark, from, to, schema }: SplitRangeOptions,
): boolean {
  const insertType = schema.marks.tracked_insert;
  const deleteType = schema.marks.tracked_delete;
  if (!insertType || !deleteType) {
    // Schema does not have track-changes marks — just apply directly.
    tr.addMark(from, to, mark);
    return false;
  }

  const newAuthorID: string =
    (mark.attrs.dataTracked as { authorID?: string } | null)?.authorID ?? "";
  const isTrackedMark = (m: Mark): boolean =>
    m.type === insertType || m.type === deleteType;

  let hadConflict = false;

  // Ranges that need the new mark applied (after conflict processing).
  // We collect "conflict sub-ranges" separately so we can set isConflict on
  // the existing marks before applying the new one.
  interface SubRange {
    from: number;
    to: number;
    isConflict: boolean;
    skipApply: boolean; // true = same-author duplicate, do not apply new mark
  }
  const subRanges: SubRange[] = [];

  // Walk all text nodes that overlap [from, to).
  tr.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
    if (!node.isText) return true; // descend into non-text nodes

    const nodeFrom = Math.max(pos, from);
    const nodeTo = Math.min(pos + node.nodeSize, to);
    if (nodeFrom >= nodeTo) return false;

    const existingTracked = node.marks.filter(isTrackedMark);

    if (existingTracked.length === 0) {
      subRanges.push({ from: nodeFrom, to: nodeTo, isConflict: false, skipApply: false });
      return false;
    }

    // Check each existing tracked mark for same/different author.
    let skipApply = false;
    let isConflict = false;

    for (const existing of existingTracked) {
      const existingAuthorID: string =
        (existing.attrs.dataTracked as { authorID?: string } | null)?.authorID ?? "";

      if (existingAuthorID === newAuthorID && existing.type === mark.type) {
        // Same author, same operation type → duplicate. Do not stack.
        skipApply = true;
        break;
      }

      if (existingAuthorID !== newAuthorID) {
        // Different author → conflict on this sub-range.
        isConflict = true;
      }
    }

    if (isConflict && !skipApply) {
      hadConflict = true;

      // Flag ALL existing tracked marks on this node as conflicted.
      for (const existing of existingTracked) {
        const existingData = existing.attrs.dataTracked as Record<string, unknown>;
        if (existingData.isConflict) continue; // already flagged

        const updatedMark = existing.type.create({
          ...existing.attrs,
          dataTracked: { ...existingData, isConflict: true },
        });

        // Re-apply mark with updated attrs over this sub-range.
        // removeMark first to avoid stacking identical marks.
        tr.removeMark(nodeFrom, nodeTo, existing.type);
        tr.addMark(nodeFrom, nodeTo, updatedMark);
      }
    }

    subRanges.push({ from: nodeFrom, to: nodeTo, isConflict, skipApply });

    return false; // don't descend further for this text node
  });

  // Now apply the new mark to all sub-ranges that are not same-author dupes.
  for (const sr of subRanges) {
    if (sr.skipApply) continue;

    const newMark = sr.isConflict
      ? updateMarkConflict(mark, true)
      : mark;

    tr.addMark(sr.from, sr.to, newMark);
  }

  // If any part of [from, to) was not covered by text nodes (gaps at block
  // boundaries), there's nothing to mark there.

  return hadConflict;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return a copy of the mark with isConflict set on its dataTracked attrs. */
function updateMarkConflict(mark: Mark, isConflict: boolean): Mark {
  const data = mark.attrs.dataTracked as Record<string, unknown>;
  if (data.isConflict === isConflict) return mark;
  return mark.type.create({
    ...mark.attrs,
    dataTracked: { ...data, isConflict },
  });
}

/**
 * Convenience wrapper: build and apply a tracked_delete mark for [from, to)
 * via splitRangeForNewMark.
 */
export function applyTrackedDelete(
  tr: Transaction,
  from: number,
  to: number,
  dataTracked: Record<string, unknown>,
  schema: Schema,
): boolean {
  const deleteType = schema.marks.tracked_delete as MarkType | undefined;
  if (!deleteType) return false;
  const mark = deleteType.create({ dataTracked });
  return splitRangeForNewMark(tr, { mark, from, to, schema });
}

/**
 * Convenience wrapper: build and apply a tracked_insert mark for [from, to)
 * via splitRangeForNewMark.
 */
export function applyTrackedInsert(
  tr: Transaction,
  from: number,
  to: number,
  dataTracked: Record<string, unknown>,
  schema: Schema,
): boolean {
  const insertType = schema.marks.tracked_insert as MarkType | undefined;
  if (!insertType) return false;
  const mark = insertType.create({ dataTracked });
  return splitRangeForNewMark(tr, { mark, from, to, schema });
}
