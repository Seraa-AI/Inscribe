import { Node as PMNode, Schema } from "prosemirror-model";
import { Transaction } from "prosemirror-state";

import { shouldMergeTrackedAttributes } from "../helpers";
import { ChangeStep, DeleteNodeStep, DeleteTextStep } from "../types";
import { ExposedFragment, TrackedAttrs } from "../types";

const genId = () => Math.random().toString(36).slice(2, 10);

/**
 * Matches deleted to inserted content and returns the first pos they differ and the updated ChangeStep list.
 * Based on https://github.com/ProseMirror/prosemirror-model/blob/master/src/diff.ts
 */
export function matchInserted(
  matchedDeleted: number,
  deleted: ChangeStep[],
  inserted: ExposedFragment,
): [number, ChangeStep[]] {
  let matched: [number, ChangeStep[]] = [matchedDeleted, deleted];
  for (let i = 0; ; i += 1) {
    if (inserted.childCount === i) return matched;

    const insNode = inserted.child(i);
    // @ts-expect-error union narrowing
    const adjDeleted: DeleteTextStep | DeleteNodeStep | undefined = matched[1].find(
      d =>
        (d.type === "delete-text" && Math.max(d.pos, d.from) === matched[0]) ||
        (d.type === "delete-node" && d.pos === matched[0]),
    );

    if (insNode.type !== adjDeleted?.node?.type) {
      return matched;
    } else if (insNode.isText && adjDeleted?.node) {
      continue;
    } else if (insNode.content.size > 0 || adjDeleted?.node.content.size > 0) {
      matched = matchInserted(
        matched[0] + 1,
        matched[1].filter(d => d !== adjDeleted),
        insNode.content as ExposedFragment,
      );
    } else {
      matched = [matched[0] + insNode.nodeSize, matched[1].filter(d => d !== adjDeleted)];
    }

    const { dataTracked, ...newAttrs } = insNode.attrs || {};
    matched[1].push({
      pos: adjDeleted.pos,
      type: "update-node-attrs",
      node: adjDeleted.node,
      newAttrs,
    });
  }
}

const assignId = (
  attrs: Partial<TrackedAttrs>,
  leftDataTracked: Partial<TrackedAttrs>,
  rightDataTracked: Partial<TrackedAttrs>,
) => {
  if (attrs.id === leftDataTracked.id || attrs.id === rightDataTracked.id) {
    return { ...attrs, id: genId() };
  }
  return attrs;
};

/**
 * Merges adjacent tracked marks at a position when they share the same author, operation, and status.
 */
export function mergeTrackedMarks(pos: number, doc: PMNode, newTr: Transaction, schema: Schema) {
  const resolved = doc.resolve(pos);
  const { nodeAfter, nodeBefore } = resolved;

  const leftMark = nodeBefore?.marks.filter(
    m => m.type === schema.marks.tracked_insert || m.type === schema.marks.tracked_delete,
  )[0];
  const rightMark = nodeAfter?.marks.filter(
    m => m.type === schema.marks.tracked_insert || m.type === schema.marks.tracked_delete,
  )[0];

  if (!nodeAfter || !nodeBefore || !leftMark || !rightMark || leftMark.type !== rightMark.type) {
    return;
  }

  const leftDataTracked: Partial<TrackedAttrs> = leftMark.attrs.dataTracked;
  const rightDataTracked: Partial<TrackedAttrs> = rightMark.attrs.dataTracked;

  if (!shouldMergeTrackedAttributes(leftDataTracked, rightDataTracked)) return;

  const isLeftOlder = (leftDataTracked.createdAt || 0) < (rightDataTracked.createdAt || 0);
  const ancestorAttrs = isLeftOlder ? leftDataTracked : rightDataTracked;
  const dataTracked = { ...ancestorAttrs, updatedAt: Date.now() };

  const fromStartOfMark = pos - nodeBefore.nodeSize;
  const toEndOfMark = pos + nodeAfter.nodeSize;

  newTr.addMark(
    fromStartOfMark,
    toEndOfMark,
    leftMark.type.create({
      ...leftMark.attrs,
      dataTracked: assignId(dataTracked, leftDataTracked, rightDataTracked),
    }),
  );
}
