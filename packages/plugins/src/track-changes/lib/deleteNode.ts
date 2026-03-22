import { Fragment, Node as PMNode } from "prosemirror-model";
import { Transaction } from "prosemirror-state";

import { dropStructuralChangeShadow } from "./structuralChange";
import { addTrackIdIfDoesntExist, getBlockInlineTrackedData, NewDeleteAttrs } from "../helpers";
import { CHANGE_OPERATION, CHANGE_STATUS } from "../types";

/** Deletes node but tries to leave content intact by merging upward first. */
export function deleteNode(node: PMNode, pos: number, tr: Transaction) {
  const resPos = tr.doc.resolve(pos);
  const canMergeToNodeAbove =
    resPos.parent !== tr.doc && resPos.nodeBefore && node.isBlock && node.firstChild?.isText;
  if (canMergeToNodeAbove) {
    return tr.replaceWith(pos - 1, pos + 1, Fragment.empty);
  }
  return tr.delete(pos, pos + node.nodeSize);
}

/** Deletes an inserted node immediately; otherwise marks it as deleted via dataTracked. */
export function deleteOrSetNodeDeleted(
  node: PMNode,
  pos: number,
  newTr: Transaction,
  deleteAttrs: NewDeleteAttrs,
) {
  const dataTracked = getBlockInlineTrackedData(node);
  const inserted = dataTracked?.find(
    d =>
      (d.operation === CHANGE_OPERATION.insert || d.operation === CHANGE_OPERATION.wrap_with_node) &&
      (d.status === CHANGE_STATUS.pending || d.status === CHANGE_STATUS.accepted),
  );
  const updated = dataTracked?.find(
    d =>
      d.operation === CHANGE_OPERATION.set_node_attributes ||
      d.operation === CHANGE_OPERATION.reference ||
      (d.operation === CHANGE_OPERATION.delete && d.moveNodeId),
  );
  const structure = dataTracked?.find(c => c.operation === CHANGE_OPERATION.structure);

  if (deleteAttrs.moveNodeId && structure && structure.moveNodeId !== deleteAttrs.moveNodeId) {
    return newTr.delete(pos, pos + node.nodeSize);
  }

  const moved = dataTracked?.find(
    d => d.operation === CHANGE_OPERATION.move && d.status === CHANGE_STATUS.pending,
  );

  if (inserted) {
    // Only remove the node directly if the SAME author is cancelling their own
    // insertion. If a different author is deleting it, fall through so the node
    // gets a tracked_delete from the current author — which coexists with the
    // existing tracked_insert as a conflict.
    if (inserted.authorID === deleteAttrs.authorID) {
      return deleteNode(node, pos, newTr);
    }
  }

  if (!newTr.doc.nodeAt(pos)) {
    console.error("deleteOrSetNodeDeleted: no node found for deletion", { pos, node, newTr });
    return;
  }

  const existingDeletes = dataTracked?.filter(
    d => d.operation === CHANGE_OPERATION.delete && d.authorID !== deleteAttrs.authorID,
  ) ?? [];

  const newDeleted = addTrackIdIfDoesntExist({
    ...deleteAttrs,
    // Flag as conflict if another author already has a delete (or insert) on this node.
    ...(inserted || existingDeletes.length > 0 ? { isConflict: true } : {}),
  });

  // If there are existing marks from other authors that now conflict, flag them too.
  const updatedDataTracked = (dataTracked ?? []).map(d => {
    if (d.authorID !== deleteAttrs.authorID && d.status === CHANGE_STATUS.pending) {
      return { ...d, isConflict: true };
    }
    return d;
  });

  const pairedChanges = [...updatedDataTracked.filter(d => d !== inserted || inserted.authorID !== deleteAttrs.authorID)];
  const finalDataTracked = updated
    ? [newDeleted, updated]
    : moved
      ? [newDeleted, moved]
      : inserted
        ? [newDeleted, ...pairedChanges.filter(d => d.operation === CHANGE_OPERATION.insert || d.operation === CHANGE_OPERATION.wrap_with_node)]
        : [newDeleted];

  newTr.setNodeMarkup(
    pos,
    undefined,
    {
      ...node.attrs,
      dataTracked: finalDataTracked,
    },
    node.marks,
  );

  if (!deleteAttrs.moveNodeId && structure?.moveNodeId) {
    dropStructuralChangeShadow(structure.moveNodeId, newTr);
  }
}

/** Keeps changes that are paired with other changes (delete with moveNodeId, reference). */
export const keepPairedChanges = (node: PMNode) => {
  const dataTracked = getBlockInlineTrackedData(node)?.filter(
    c =>
      (c.operation === CHANGE_OPERATION.delete && c.moveNodeId) ||
      c.operation === CHANGE_OPERATION.reference,
  );
  return dataTracked?.length ? dataTracked : null;
};
