import { Node as PMNode } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { AttrStep } from "prosemirror-transform";

import { NewEmptyAttrs } from "../helpers";
import { ChangeStep } from "../types";

function trackAttrsChangeStep(
  step: AttrStep,
  _oldState: EditorState,
  _tr: Transaction,
  newTr: Transaction,
  _attrs: NewEmptyAttrs,
  currentStepDoc: PMNode,
) {
  const newStep = step.invert(currentStepDoc);
  const stepResult = newTr.maybeStep(newStep);
  if (stepResult.failed) {
    console.error(
      `inverting ReplaceAroundStep failed: "${stepResult.failed}"`,
      newStep,
    );
    return [];
  }
  const node = currentStepDoc.nodeAt(step.pos);

  if (!node) {
    return [];
  }

  const { dataTracked, ...newAttrs } = node.attrs || {};

  const changeStep = {
    pos: step.pos,
    type: "update-node-attrs",
    node,
    newAttrs: {
      ...newAttrs,
      [step.attr]: step.value,
    },
  } as ChangeStep;

  return [changeStep];
}

export default trackAttrsChangeStep;
