import { Mark, Node as PMNode } from "prosemirror-model";
import { Transaction } from "prosemirror-state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
} from "prosemirror-transform";

import {
  createNewDeleteAttrs,
  createNewInsertAttrs,
  NewEmptyAttrs,
  isValidTrackableMark,
} from "../helpers";
import { CHANGE_OPERATION, DataTrackedAttrs } from "../types";

const genId = () => Math.random().toString(36).slice(2, 10);

function markHasOp(mark: Mark, operation: CHANGE_OPERATION) {
  if (mark.attrs.dataTracked && Array.isArray(mark.attrs.dataTracked)) {
    const dtAttrs = mark.attrs.dataTracked as DataTrackedAttrs[];
    return dtAttrs.some(at => at.operation === operation);
  }
}

export function trackRemoveMarkStep(
  step: RemoveMarkStep,
  emptyAttrs: NewEmptyAttrs,
  newTr: Transaction,
  doc: PMNode,
) {
  if (isValidTrackableMark(step.mark)) {
    const markName = step.mark.type.name;
    const markSource = step.mark.type.schema.marks[step.mark.type.name];
    let sameMark: Mark | null = null;

    const targetNode = doc.nodeAt(step.from);

    if (targetNode) {
      let targetNodePos = -1;

      doc.descendants((node, pos) => {
        if (node === targetNode) {
          targetNodePos = pos;
        }
        if (targetNodePos >= 0) {
          return false;
        }
      });

      const parentsSameMark = targetNode.marks.find(mark => {
        if (mark.type.name === markName && mark.attrs.dataTracked?.length) {
          return mark;
        }
      });
      const nodeEnd = targetNodePos + targetNode.nodeSize;
      if (parentsSameMark && step.from <= nodeEnd && step.to <= nodeEnd) {
        sameMark = parentsSameMark;
      }
    }

    const newDataTracked = createNewDeleteAttrs(emptyAttrs);
    const newMark = markSource!.create({
      dataTracked: [{ ...newDataTracked, id: genId() }],
    });
    let newStep = new AddMarkStep(step.from, step.to, newMark);

    if (sameMark) {
      if (markHasOp(step.mark, CHANGE_OPERATION.delete)) {
        newStep = new AddMarkStep(
          step.from,
          step.to,
          markSource!.create({
            dataTracked: [],
          }),
        );
      }
      if (markHasOp(step.mark, CHANGE_OPERATION.insert)) {
        newStep = new RemoveMarkStep(step.from, step.to, step.mark);
      }
    }

    try {
      newTr.step(newStep);
    } catch (e) {
      console.error("Unable to record a RemoveMarkStep with error: " + e);
    }
  }
}

export function trackRemoveNodeMarkStep(
  step: RemoveNodeMarkStep,
  emptyAttrs: NewEmptyAttrs,
  newTr: Transaction,
  doc: PMNode,
) {
  if (isValidTrackableMark(step.mark)) {
    const markName = step.mark.type.name;
    const markSource = step.mark.type.schema.marks[markName];

    let sameMark: Mark | null = null;

    const targetNode = doc.nodeAt(step.pos);
    if (targetNode) {
      targetNode.marks.find(mark => {
        if (mark.type.name === markName && mark.attrs.dataTracked?.length) {
          sameMark = mark;
        }
      });
    }

    const newDataTracked = createNewDeleteAttrs(emptyAttrs);
    const newMark = markSource!.create({
      dataTracked: [{ ...newDataTracked, id: genId() }],
    });
    let newStep = new AddNodeMarkStep(step.pos, newMark);

    if (sameMark) {
      if (markHasOp(step.mark, CHANGE_OPERATION.delete)) {
        newStep = new AddNodeMarkStep(
          step.pos,
          markSource!.create({
            dataTracked: [],
          }),
        );
      }
      if (markHasOp(step.mark, CHANGE_OPERATION.insert)) {
        newStep = new AddNodeMarkStep(step.pos, step.mark);
      }
    }
    try {
      const inverted = step.invert(doc);
      newTr.step(inverted);
      newTr.step(newStep);
    } catch (e) {
      console.error("Unable to record a RemoveNodeMarkStep with error: " + e);
    }
  }
}

export function trackAddMarkStep(
  step: AddMarkStep,
  emptyAttrs: NewEmptyAttrs,
  newTr: Transaction,
  _doc: PMNode,
) {
  if (isValidTrackableMark(step.mark)) {
    const markName = step.mark.type.name;
    const markSource = step.mark.type.schema.marks[markName];

    const newDataTracked = createNewInsertAttrs(emptyAttrs);
    const newMark = markSource!.create({
      dataTracked: [{ ...newDataTracked, id: genId() }],
    });
    const newStep = new AddMarkStep(step.from, step.to, newMark);
    try {
      const inverted = step.invert();
      newTr.step(inverted);
      newTr.step(newStep);
    } catch (e) {
      console.error("Unable to record a remove node mark step: " + e);
    }
  }
}

export function trackAddNodeMarkStep(
  step: AddNodeMarkStep,
  emptyAttrs: NewEmptyAttrs,
  newTr: Transaction,
  stepDoc: PMNode,
) {
  if (isValidTrackableMark(step.mark)) {
    const newDataTracked = createNewInsertAttrs(emptyAttrs);
    const markSource = step.mark.type.schema.marks[step.mark.type.name];
    const newMark = markSource!.create({
      dataTracked: [{ ...newDataTracked, id: genId() }],
    });
    const newStep = new AddNodeMarkStep(step.pos, newMark);
    try {
      const inverted = step.invert(stepDoc);
      newTr.step(inverted);
      newTr.step(newStep);
    } catch (e) {
      console.error("Unable to record an AddNodeMarkStep with error: " + e);
    }
  }
}
