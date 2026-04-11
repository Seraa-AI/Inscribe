/**
 * Shared line-fitting primitive used by every layout consumer that needs
 * to split a flat line list against a single vertical capacity.
 *
 * This is the smallest reusable kernel inside `paginateFlow`'s split loop —
 * the inner "walk lines, accumulate height, stop when capacity runs out"
 * step. `paginateFlow`'s enclosing control flow (gap suppression, margin
 * collapsing, leaf-block handling, hard page breaks) is NOT shared here
 * because it's body-pagination-specific and can't be cleanly factored
 * without a larger refactor. But the inner accumulator is genuinely
 * reusable: any future consumer that needs to split a line list against
 * a capacity (a footnote-band filler, a balanced-column equalizer, a
 * line-number gutter, a widow/orphan enforcer) can call this function
 * instead of reimplementing the walk.
 *
 * Why extract this small helper rather than reuse `paginateFlow` itself:
 *
 *   - `paginateFlow` is top-down page-fill — it walks flow blocks in order
 *     and advances pages when they overflow. That control flow is wrong for
 *     consumers that need to fill a band (bottom-up) or a column (parallel
 *     streams) rather than a sequence of pages.
 *
 *   - `paginateFlow`'s hot loop is entangled with body-specific concerns
 *     that don't apply outside body pagination: margin collapsing between
 *     adjacent blocks, gap suppression on the first block of a page,
 *     leaf-block too-tall handling. Any consumer that tried to reuse the
 *     full loop would either inherit those concerns (wrong) or paper over
 *     them with config flags (fragile).
 *
 *   - The inner kernel — "given a line list and a capacity, how many lines
 *     fit?" — is genuinely identical across every consumer. Extracting it
 *     gives the small reusable piece without dragging the body-pagination
 *     control flow along.
 *
 * The function is intentionally boring: no fancy break-point selection, no
 * widow/orphan awareness, no lookahead. It just walks lines top-down, takes
 * as many as fit, and returns the split point. Callers that want smarter
 * rules layer them on top.
 *
 * At some point `paginateFlow`'s own split loop should call this function
 * too, collapsing the two implementations. That's deferred until there's a
 * second real caller to validate the shape against — refactoring the hot
 * loop without a validation point risks introducing a subtle regression.
 */

import type { LayoutLine } from "./LineBreaker";

export interface FitLinesResult {
  /** Lines that fit within the capacity, in input order. */
  fitted: LayoutLine[];
  /**
   * Lines that didn't fit, in input order. Empty when all input lines fit.
   * These are the caller's responsibility to place elsewhere — typically
   * on the next page or in a spill queue.
   */
  rest: LayoutLine[];
  /**
   * Sum of `lineHeight` across the fitted lines. Always 0 when `fitted` is empty.
   * Callers use this to advance their Y cursor after placing the fitted part.
   */
  fittedHeight: number;
}

/**
 * Walk a flat line list and return the largest prefix that fits within a
 * given vertical capacity, plus the remainder.
 *
 * Greedy and monotonic: lines are consumed in order, no reordering, no
 * skipping. If `lines[0].lineHeight > capacity`, zero lines fit and the
 * caller decides how to handle overflow (force one line on an empty page,
 * spill to the next capacity, etc.).
 *
 * Edge cases:
 * - Empty `lines` input → `{ fitted: [], rest: [], fittedHeight: 0 }`
 * - `capacity <= 0` → `{ fitted: [], rest: lines, fittedHeight: 0 }`
 * - Capacity exactly matches total height → all lines fitted, `rest` empty
 * - Single line larger than capacity → zero fit, `rest` is the full input
 *
 * Performance: O(fitted.length) walk, stops at the first line that doesn't
 * fit. Array slicing at the end is O(fitted.length + rest.length) which is
 * unavoidable without changing the return shape. Callers that care about
 * allocations can compare `fitted.length === lines.length` to detect the
 * "all fit" case before slicing — but for typical footnote bodies (dozens
 * of lines, not thousands) this isn't worth optimizing.
 *
 * This function is PURE — no side effects, no closure state, no external
 * reads. Deterministic given its inputs, safe to call from hot loops and
 * iterative layout passes.
 */
export function fitLinesInCapacity(
  lines: LayoutLine[],
  capacity: number,
): FitLinesResult {
  if (lines.length === 0 || capacity <= 0) {
    return { fitted: [], rest: lines, fittedHeight: 0 };
  }

  let fittedHeight = 0;
  let i = 0;
  while (i < lines.length) {
    const next = lines[i]!;
    if (fittedHeight + next.lineHeight > capacity) break;
    fittedHeight += next.lineHeight;
    i++;
  }

  return {
    fitted: lines.slice(0, i),
    rest: lines.slice(i),
    fittedHeight,
  };
}
