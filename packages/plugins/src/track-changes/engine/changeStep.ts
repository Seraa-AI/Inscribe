import { Mapping } from "prosemirror-transform";

import { ChangeStep } from "../types";

export function mapChangeSteps(steps: ChangeStep[], mapping: Mapping) {
  steps.forEach(step => {
    if ("from" in step) {
      step.from = mapping.map(step.from);
    }
    if ("to" in step) {
      step.to = mapping.map(step.to);
    }
    if ("pos" in step) {
      step.pos = mapping.map(step.pos);
    }
    if ("nodeEnd" in step) {
      step.nodeEnd = mapping.map(step.nodeEnd);
    }
    if ("mergePos" in step) {
      step.mergePos = mapping.map(step.mergePos);
    }
  });
  return steps;
}
