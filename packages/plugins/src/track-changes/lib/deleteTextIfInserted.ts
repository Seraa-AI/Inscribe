import { Fragment, Node as PMNode, Schema } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

import { addTrackIdIfDoesntExist, getMergeableMarkTrackedAttrs, NewDeleteAttrs } from "../helpers";

/**
 * Deletes inserted text directly; otherwise wraps it with a tracked_delete mark.
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

  if (node.marks.find(m => m.type === schema.marks.tracked_insert)) {
    newTr.replaceWith(start, end, Fragment.empty);
    return start;
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

  const dataTracked = addTrackIdIfDoesntExist({ ...leftMarks, ...rightMarks, ...deleteAttrs, createdAt });

  newTr.addMark(
    fromStartOfMark,
    toEndOfMark,
    schema.marks!.tracked_delete!.create({ dataTracked }),
  );

  return toEndOfMark;
}
