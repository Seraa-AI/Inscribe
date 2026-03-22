import { Fragment, Node as PMNode, Schema } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

import { addTrackIdIfDoesntExist, getMergeableMarkTrackedAttrs, NewDeleteAttrs } from "../helpers";
import { splitRangeForNewMark } from "./splitRangeForNewMark";

/**
 * Deletes inserted text directly (same-author cancel); otherwise wraps it with
 * a tracked_delete mark.
 *
 * When the node already carries a tracked_insert from a DIFFERENT author,
 * we do NOT remove the text — instead we stack a tracked_delete on top and
 * let splitRangeForNewMark flag both marks as isConflict: true.
 *
 * Returns the position at the end of the possibly deleted text.
 */
export function deleteTextIfInserted(
  node: PMNode,
  pos: number,
  newTr: Transaction,
  schema: Schema,
  deleteAttrs: NewDeleteAttrs,
  from?: number,
  to?: number,
) {
  const start = from ? Math.max(pos, from) : pos;
  const nodeEnd = pos + node.nodeSize;
  const end = to ? Math.min(nodeEnd, to) : nodeEnd;

  const insertMark = node.marks.find(m => m.type === schema.marks.tracked_insert);
  if (insertMark) {
    const insertAuthorID = (insertMark.attrs.dataTracked as { authorID?: string } | null)
      ?.authorID;

    if (insertAuthorID === deleteAttrs.authorID) {
      // Same author cancelling their own insertion → remove the text outright.
      newTr.replaceWith(start, end, Fragment.empty);
      return start;
    }
    // Different author's insert — fall through to apply tracked_delete via
    // splitRangeForNewMark, which will flag both marks as isConflict: true.
  }

  const leftNode = newTr.doc.resolve(start).nodeBefore;
  const leftMarks = getMergeableMarkTrackedAttrs(leftNode, deleteAttrs, schema);
  const rightNode = newTr.doc.resolve(end).nodeAfter;
  const rightMarks = getMergeableMarkTrackedAttrs(rightNode, deleteAttrs, schema);

  const fromStartOfMark = start - (leftNode && leftMarks ? leftNode.nodeSize : 0);
  const toEndOfMark = end + (rightNode && rightMarks ? rightNode.nodeSize : 0);
  const createdAt = Math.min(
    leftMarks?.createdAt || Number.MAX_VALUE,
    rightMarks?.createdAt || Number.MAX_VALUE,
    deleteAttrs.createdAt,
  );

  const dataTracked = addTrackIdIfDoesntExist({
    ...leftMarks,
    ...rightMarks,
    ...deleteAttrs,
    createdAt,
  });

  const deleteMark = schema.marks!.tracked_delete!.create({ dataTracked });

  // splitRangeForNewMark handles conflict detection:
  // - same author already marked → skip (no duplicate stacking)
  // - different author already marked → set isConflict: true on both marks
  splitRangeForNewMark(newTr, {
    mark: deleteMark,
    from: fromStartOfMark,
    to: toEndOfMark,
    schema,
  });

  return toEndOfMark;
}
