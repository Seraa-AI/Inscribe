/**
 * `runMiniPipeline` — measurement-only layout pass for mini-documents
 * (headers, footers, footnote bodies, comment contents, and any other
 * secondary content that needs to be measured without triggering the
 * main pagination pipeline's chrome aggregator).
 *
 * Phase 0 step 1.8 (see `docs/weekend-plan-2026-04-12.md` §PR 1 and
 * `docs/export-extensibility.md` §6.1).
 *
 * ## What it does
 *
 * Runs a stripped-down variant of the main pipeline:
 *
 *   1. `collectLayoutItems` — walk the doc, produce flat items
 *   2. `buildBlockFlow` — measure every block's lines (Stage 1)
 *   3. `paginateFlow` (pageless) — stack blocks vertically with margin collapsing
 *
 * Does NOT run:
 *
 *   - `aggregateChrome` (doesn't exist yet in Phase 0; will exist in Phase 1b)
 *   - `applyFloatLayout` (floats don't exist in mini-docs — a header or
 *     footnote body that embedded a float would be layered rendering, not
 *     flow content, and that's out of scope for v1)
 *   - `buildFragments` (callers inspect blocks directly; fragment identity
 *     is a pagination concern that mini-docs don't have)
 *   - Phase 1b early-termination cache (mini-docs are small enough that
 *     the cache overhead isn't worth it; always full-measure)
 *   - Streaming / resumption (mini-docs are always small, completed in
 *     one synchronous pass)
 *
 * ## Why it exists as a separate function
 *
 * See `docs/export-extensibility.md` §6.1 and
 * `docs/multi-surface-architecture.md` §3.4. The short version:
 *
 *   - Chrome contributors (the header-footer plugin, the footnotes plugin)
 *     will need to measure mini-docs from inside their `measure()` hook
 *   - Calling `runPipeline` from that hook would re-enter `aggregateChrome`
 *     and cause infinite recursion
 *   - `runMiniPipeline` is physically unable to call `aggregateChrome` —
 *     the aggregator isn't even imported into this file — so using it as
 *     the entry point makes the correct thing also the obvious thing
 *
 * `runPipeline` has a recursion guard that throws on re-entry. If a plugin
 * author accidentally calls `runPipeline` instead of `runMiniPipeline`,
 * the guard catches it with a readable error message pointing at this file.
 *
 * ## Pageless semantics
 *
 * `runMiniPipeline` always runs in pageless mode — blocks stack on a single
 * virtual page with no overflow handling. The caller reads the natural
 * height from the returned layout to compute how much vertical space the
 * mini-doc needs (e.g. for a header band height). There's no meaningful
 * "page 2 of the mini-doc" concept.
 *
 * `pageless: true` in PageConfig is what enables this — `paginateFlow`
 * skips the overflow check and keeps appending to the current page
 * indefinitely.
 *
 * ## What's returned
 *
 * A minimal `DocumentLayout`-shaped object with:
 *   - `pages: [LayoutPage]` — always exactly one page
 *   - `pageConfig` — the pageConfig that was passed in (with pageless: true forced)
 *   - `version: 1` — mini-docs don't carry version state
 *   - `totalContentHeight` — Y of the bottom of the last block, for band-height computation
 *   - `metrics: [PageMetrics]` — a single-entry array, mirrors runPipeline's shape
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
  // If a future chrome contributor ever needs to measure sub-chrome (e.g. a
  // nested footnote inside a header), it still uses EMPTY_RESOLVED_CHROME
  // here; the recursion guard on the outer runPipeline prevents the nesting
  // from becoming a problem.
  const resolved = EMPTY_RESOLVED_CHROME;

  // Per-page metrics helper — mirrors runPipeline's shape but trivially
  // simple since we only ever need page 1.
  const page1Metrics = computePageMetrics(pageConfig, resolved, 1);
  const metricsFor = (pageNumber: number): PageMetrics =>
    pageNumber === 1
      ? page1Metrics
      : computePageMetrics(pageConfig, resolved, pageNumber);

  // ── Stage 1: measure ───────────────────────────────────────────────────
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

  // ── Stage 2: paginate (pageless) ───────────────────────────────────────
  const initPage: { pageNumber: number; blocks: [] } = { pageNumber: 1, blocks: [] };
  const pr = paginateFlow(
    flowResult.flows,
    pageConfig,
    resolved,
    metricsFor,
    0, // runId 0 — mini-docs aren't run-identified
    undefined, // no previousLayout — no Phase 1b
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
