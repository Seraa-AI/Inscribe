/**
 * `runMiniPipeline` — measurement-only layout pass for mini-documents
 * (headers, footers, footnote bodies, comment contents, and any other
 * secondary content that needs to be measured without triggering the
 * main pagination pipeline's chrome aggregator).
 *
 * ## What it does
 *
 * Runs a stripped-down variant of the main pipeline:
 *
 *   1. `collectLayoutItems` — walk the doc, produce flat items
 *   2. `buildBlockFlow` — measure every block's lines
 *   3. `paginateFlow` (pageless) — stack blocks vertically with margin collapsing
 *
 * Does NOT run:
 *
 *   - The chrome aggregator (it doesn't exist yet, and won't be called from
 *     this function even after it does — that's the whole point of having
 *     a separate entry point)
 *   - `applyFloatLayout` — floats don't exist in mini-docs. A header or
 *     footnote body that embedded a float would be layered rendering, not
 *     flow content, and is out of scope.
 *   - `buildFragments` — callers inspect blocks directly; fragment identity
 *     is a pagination concern that mini-docs don't have
 *   - The early-termination cache — mini-docs are small enough that the
 *     cache overhead isn't worth it; always full-measure
 *   - Streaming / resumption — mini-docs are always small, completed in
 *     one synchronous pass
 *
 * ## Why it exists as a separate function, not a flag on `runPipeline`
 *
 * Chrome contributors (a future header-footer plugin, a future footnotes
 * plugin) will need to measure mini-documents from inside their own
 * `measure()` hook — a header contributor measures its header content,
 * a footnote contributor measures its footnote bodies, etc. These hooks
 * run from inside the main pipeline's chrome aggregator.
 *
 * If a contributor called `runPipeline` from its hook, `runPipeline` would
 * re-enter the aggregator, which would re-invoke the contributor, which
 * would re-call `runPipeline`, and so on — infinite recursion. The fix is
 * to make it structurally impossible: `runMiniPipeline` lives in a separate
 * file, doesn't import the aggregator, and can be called freely from
 * anywhere without risk of re-entry.
 *
 * `runPipeline` has a recursion guard that throws on re-entry as a
 * belt-and-suspenders safety net. If a plugin author accidentally calls
 * `runPipeline` instead of `runMiniPipeline`, the guard catches it with a
 * readable error message pointing at this file as the correct choice.
 *
 * A simple flag on `runPipeline` (e.g. `skipChrome: true`) would be easy to
 * forget or accidentally clear, so the two entry points are kept physically
 * separate instead.
 *
 * ## Pageless semantics
 *
 * `runMiniPipeline` always runs in pageless mode — blocks stack on a single
 * virtual page with no overflow handling. The caller reads the natural
 * height from the returned layout to compute how much vertical space the
 * mini-doc needs (e.g. for a header band height). There's no meaningful
 * "page 2 of the mini-doc" concept: a header doesn't paginate across
 * multiple pages, it just is as tall as its content.
 *
 * `pageless: true` in PageConfig is what enables this — `paginateFlow`
 * skips the overflow check and keeps appending to the current page
 * indefinitely. `runMiniPipeline` forces `pageless: true` regardless of
 * what the caller passed in, so consumers don't need to remember to set it.
 *
 * ## What's returned
 *
 * A minimal `DocumentLayout`-shaped object with:
 *   - `pages: [LayoutPage]` — always exactly one page
 *   - `pageConfig` — the pageConfig that was passed in, with `pageless: true` forced
 *   - `version: 1` — mini-docs don't carry version state
 *   - `totalContentHeight` — Y of the bottom of the last block, for band-height computation
 *   - `metrics: [PageMetrics]` — a single-entry array, mirrors `runPipeline`'s shape
 *   - `runId: 0` — mini-doc measurements aren't run-identified
 *   - `convergence: "stable"` — no iteration possible
 *   - `iterationCount: 1`
 *
 * Fields NOT set: `fragments`, `fragmentsByPage`, `floats`, `_pass1Pages`,
 * `resumption`, `isPartial`. Callers that expect these will see `undefined`.
 */

import type { Node } from "prosemirror-model";
import type { FontModifier } from "../extensions/types";
import type { TextMeasurer } from "./TextMeasurer";
import {
  type PageConfig,
  type DocumentLayout,
  type FlowConfig,
  collectLayoutItems,
  buildBlockFlow,
  paginateFlow,
} from "./PageLayout";
import {
  EMPTY_RESOLVED_CHROME,
  computePageMetrics,
  type PageMetrics,
} from "./PageMetrics";
import {
  defaultFontConfig,
  DEFAULT_FONT_FAMILY,
  applyPageFont,
  type FontConfig,
} from "./FontConfig";

export interface MiniPipelineOptions {
  /**
   * PageConfig for the mini-doc. `pageless` is forced to `true` internally
   * so callers don't need to set it — the caller's intent is "measure this
   * mini-doc and tell me how tall it is," not "paginate it."
   */
  pageConfig: PageConfig;
  measurer: TextMeasurer;
  fontConfig?: FontConfig;
  fontModifiers?: Map<string, FontModifier>;
}

/**
 * Measurement-only layout pass for mini-documents. See file-level doc above
 * for the full contract.
 *
 * Always deterministic, always synchronous, always single-page, always pageless.
 * Safe to call from inside a chrome contributor's measure() hook without
 * triggering recursive pagination.
 */
export function runMiniPipeline(
  doc: Node,
  options: MiniPipelineOptions,
): DocumentLayout {
  const { measurer, fontModifiers } = options;

  // Force pageless regardless of what the caller passed in. The caller's
  // intent is measurement, not pagination.
  const pageConfig: PageConfig = { ...options.pageConfig, pageless: true };

  const baseConfig = options.fontConfig ?? defaultFontConfig;
  const fontConfig = applyPageFont(
    baseConfig,
    pageConfig.fontFamily ?? DEFAULT_FONT_FAMILY,
  );

  const { pageWidth, margins } = pageConfig;
  const contentWidth = pageWidth - margins.left - margins.right;

  // Always use EMPTY_RESOLVED_CHROME — mini-pipelines cannot aggregate chrome.
  // Even if a future chrome contributor needs to measure sub-chrome (e.g. a
  // nested footnote inside a header), the nested call still uses the empty
  // resolved chrome here; the recursion guard on the outer runPipeline
  // prevents the nesting from becoming a runaway loop.
  const resolved = EMPTY_RESOLVED_CHROME;

  // Per-page metrics helper — mirrors runPipeline's shape but trivially
  // simple since we only ever need page 1 (pageless means everything lands
  // on one virtual page). The fallback for pageNumber > 1 exists only to
  // satisfy `paginateFlow`'s signature; it should never be called.
  const page1Metrics = computePageMetrics(pageConfig, resolved, 1);
  const metricsFor = (pageNumber: number): PageMetrics =>
    pageNumber === 1
      ? page1Metrics
      : computePageMetrics(pageConfig, resolved, pageNumber);

  // ── Measure blocks ─────────────────────────────────────────────────────
  const items = collectLayoutItems(doc, fontConfig);
  const flowConfig: FlowConfig = { margins, contentWidth };
  const flowResult = buildBlockFlow(
    items,
    0,
    flowConfig,
    fontConfig,
    measurer,
    fontModifiers,
    undefined, // no measure cache — mini-docs always re-measure
    undefined, // no maxBlocks cutoff
  );

  // ── Stack blocks (pageless) ────────────────────────────────────────────
  const initPage: { pageNumber: number; blocks: [] } = { pageNumber: 1, blocks: [] };
  const pr = paginateFlow(
    flowResult.flows,
    pageConfig,
    resolved,
    metricsFor,
    0, // runId 0 — mini-docs aren't identified by per-run counters
    undefined, // no previousLayout — no cross-run cache shortcut
    undefined, // no measureCache
    [],
    initPage,
    page1Metrics.contentTop,
    0,
    true, // pageless — forced above too, but passed explicitly for clarity
  );

  // Pageless mode never advances pages; everything is on `pr.currentPage`.
  const singlePage = pr.currentPage;

  // ── Build the returned DocumentLayout ──────────────────────────────────
  // totalContentHeight is the Y of the bottom of the last block, minus the
  // content top. Callers use this as the mini-doc's natural height.
  const naturalHeight = pr.y - page1Metrics.contentTop;

  return {
    pages: [singlePage],
    pageConfig,
    version: 1,
    totalContentHeight: naturalHeight,
    metrics: [page1Metrics],
    runId: 0,
    convergence: "stable",
    iterationCount: 1,
  };
}
