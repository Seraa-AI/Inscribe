/**
 * Per-page layout metrics.
 *
 * This module introduces the primitives that let iterative-chrome contributors
 * (headers, footers, footnote bands, margin-notes gutters) reserve per-page
 * vertical space without scattering `pageHeight - margins.bottom` arithmetic
 * across `runPipeline`, `paginateFlow`, and `applyFloatLayout`. Instead, every
 * vertical-position read in the pipeline goes through `computePageMetrics`
 * which returns a single `PageMetrics` bundle for a specific page number.
 *
 * Why per-page, not a single shared constant:
 *
 *   - Different-first-page headers (a Word/Docs convention) reserve a
 *     different amount of top space on page 1 than on pages 2+. Handling
 *     that via a shared constant would require either always reserving the
 *     first-page height everywhere (wasting space on pages 2+) or always
 *     reserving the default height everywhere (breaking page 1).
 *
 *   - Footnotes reserve different bottom space per page depending on which
 *     footnote refs anchor on that page. There's no way to express "page N
 *     reserves 40px, page N+1 reserves 120px" without per-page metrics.
 *
 * A `PageMetrics` bundle carries its own `pageNumber`, so passing one into a
 * function is unambiguous about which page it describes. `computePageMetrics`
 * is a pure function — same inputs always produce the same output, safe to
 * call from hot loops, no caching required at the implementation level
 * (callers that hit this repeatedly memoize at their own level).
 *
 * Current state: no chrome contributors exist yet. `EMPTY_RESOLVED_CHROME`
 * is used throughout the pipeline as the placeholder `ResolvedChrome` input.
 * With no contributors, `computePageMetrics` reduces to the hand-computed
 * `margins.top` / `pageHeight - margins.bottom` formula on every page, so
 * every existing layout test passes unchanged. When a plugin registers a
 * chrome contributor, its per-page reservations flow through the same
 * function and the pipeline respects them automatically.
 */

import type { PageConfig } from "./PageLayout";

/**
 * Geometry for a single page, computed from `PageConfig` + the sum of all
 * chrome contributions for that specific page. Pure data — no methods, no
 * closures. Safe to cache, compare, and serialize.
 *
 * Consumed by `runPipeline`, `paginateFlow`, and `applyFloatLayout` instead
 * of raw `pageConfig.pageHeight - margins.bottom` arithmetic. The per-page
 * shape is load-bearing: different-first-page headers and footnotes both
 * produce metrics that vary by page number.
 */
export interface PageMetrics {
  /** 1-based page number this bundle applies to. */
  pageNumber: number;
  /** Y of the top of flow content = margins.top + headerHeight for this page. */
  contentTop: number;
  /**
   * Y of the bottom of flow content =
   *   pageHeight - margins.bottom - footerHeight for this page.
   */
  contentBottom: number;
  /** contentBottom - contentTop. Available vertical space for flow on this page. */
  contentHeight: number;
  /**
   * pageWidth - margins.left - margins.right.
   * Constant across pages until multi-column layout lands. Included here
   * so downstream code can read everything page-related through one bundle.
   */
  contentWidth: number;
  /** Y of the top of the header band (always equal to margins.top). */
  headerTop: number;
  /**
   * Y of the top of the footer band for this page =
   *   pageHeight - margins.bottom - footerHeight.
   */
  footerTop: number;
  /**
   * Resolved header height for this page. 0 when no chrome contributor
   * reserves top space (currently true throughout the pipeline — no
   * contributors have been registered yet).
   */
  headerHeight: number;
  /**
   * Resolved footer height for this page. 0 when no chrome contributor
   * reserves bottom space.
   */
  footerHeight: number;
}

/**
 * One chrome contribution (typically one plugin's worth of header / footer /
 * footnote band / margin-notes gutter / etc.). Each contributor exposes
 * per-page top and bottom reservations plus an opaque `payload` that the
 * core never inspects — it just routes the payload back to the contributor
 * at paint time.
 *
 * Currently inert: no contributors exist, `ResolvedChrome.contributions` is
 * always empty, and none of these methods are ever called. The shape is
 * declared here so future chrome-contributing plugins can be wired in
 * without changing the type surface.
 *
 * Iterative vs. non-iterative contributors:
 *
 *   - Non-iterative contributors (headers, footers) compute their
 *     contribution in a single pass and report `stable: true` on iteration 1.
 *     Their reservation doesn't depend on where flow content lands, so the
 *     aggregator can accept their output and move on.
 *
 *   - Iterative contributors (footnotes) depend on the flow layout to
 *     determine which footnote bodies appear on which page. They may need
 *     several iterations before their per-page reservations stabilize — for
 *     example, reserving space for a footnote pushes flow content forward,
 *     which might move another footnote's anchor to a different page,
 *     changing the reservations. They report `stable: true` only when the
 *     anchor→page assignment matches the previous iteration.
 *
 * The eventual aggregator loop exits when every contributor reports
 * `stable: true` in the same iteration, or hits a max-iteration safety cap.
 */
export interface ChromeContribution {
  /** Reserved vertical space at the top of page `pageNumber` (px). */
  topForPage(pageNumber: number): number;
  /** Reserved vertical space at the bottom of page `pageNumber` (px). */
  bottomForPage(pageNumber: number): number;
  /**
   * Opaque per-contributor state. Carried through `DocumentLayout._chromePayloads`
   * and handed back to the contributor at paint time. Core never inspects it.
   */
  payload?: unknown;
  /**
   * True when this contributor has reached a fixed point for its own inputs.
   * See the interface doc comment for the iterative-vs-non-iterative
   * distinction. Currently unused (no contributors, no iteration) but declared
   * here so the type is complete.
   */
  stable: boolean;
  /**
   * Number of synthetic pages this contributor needs appended after the
   * flow's last natural page. Used for chrome-only overflow: a footnote
   * that doesn't fit on any of the document's natural pages can request
   * extra footnote-only pages at the end where it can spill its content.
   * Zero for contributors that never overflow (headers, footers).
   */
  syntheticPages?: number;
}

/**
 * All chrome contributions for a single layout run, plus a version hash.
 *
 * `contributions` is keyed by contributor name (e.g. `"headerFooter"`,
 * `"footnotes"`) — same name the plugin uses when it registers. The
 * `metricsVersion` is a stable hash of the resolved state used by the
 * cross-run early-termination cache to decide whether a cached block
 * placement is still valid: if any contributor's output shape changed
 * between runs, the version bumps and the cache is invalidated for that
 * block.
 *
 * Currently, `contributions` is always the empty record `{}` (no
 * contributors have been registered yet) and `metricsVersion` is always 0.
 */
export interface ResolvedChrome {
  contributions: Record<string, ChromeContribution>;
  /**
   * Monotonic identity hash. Any change to any contributor's contribution
   * bumps this. `metricsVersion === 0` is reserved for the zero-contributor
   * state (current default). Once contributors exist, this is computed as
   * a stable hash over every contributor's identity — same inputs always
   * produce the same hash, different inputs always produce different hashes.
   */
  metricsVersion: number;
}

/**
 * Pure function. Given a `PageConfig` and a `ResolvedChrome`, produce the
 * `PageMetrics` for one specific page. No caching — callers that hit this
 * repeatedly should memoize at the call site. `paginateFlow` maintains a
 * 1-entry cache keyed by `currentPage.pageNumber` since page advances are
 * sequential and the cache hits on nearly every call.
 *
 * Behavior with zero contributors (current default): the returned metrics
 * match the hand-computed formula on every page:
 *
 *   contentTop    = margins.top
 *   contentBottom = pageHeight - margins.bottom
 *   contentHeight = contentBottom - contentTop
 *   contentWidth  = pageWidth - margins.left - margins.right
 *   headerHeight  = 0
 *   footerHeight  = 0
 *
 * This is what lets the rest of the pipeline be refactored to read through
 * `computePageMetrics` without changing any pre-refactor behavior — zero
 * contributors means `computePageMetrics` returns the same numbers the
 * pipeline used to compute by hand.
 *
 * With real contributors, `headerHeight` and `footerHeight` sum over every
 * contributor's `topForPage(pageNumber)` / `bottomForPage(pageNumber)`
 * result. Different contributors can reserve different amounts per page
 * (e.g. a header plugin that sets a taller band on page 1 than on pages 2+).
 *
 * Pageless mode: `config.pageless === true` zeros out the footer reservation
 * because a pageless layout has no meaningful bottom to clamp against (the
 * flow grows unbounded on a single virtual page). Top reservations still
 * apply if a contributor requests them, though in practice chrome contributors
 * typically short-circuit on `pageless` and don't reserve anything.
 */
export function computePageMetrics(
  config: PageConfig,
  resolved: ResolvedChrome,
  pageNumber: number,
): PageMetrics {
  const { pageWidth, pageHeight, margins } = config;

  let headerHeight = 0;
  let footerHeight = 0;

  for (const contribution of Object.values(resolved.contributions)) {
    headerHeight += contribution.topForPage(pageNumber);
    // Pageless mode has no meaningful footer position — the flow grows
    // unbounded. Skip bottom reservations so callers don't clamp against
    // a nonsense `contentBottom`.
    if (!config.pageless) {
      footerHeight += contribution.bottomForPage(pageNumber);
    }
  }

  const contentTop = margins.top + headerHeight;
  // In pageless mode, `contentBottom` is unused (overflow is disabled) but
  // we still return a finite number rather than Infinity so callers that
  // print debug metrics don't get surprising output.
  const contentBottom = config.pageless
    ? pageHeight // effectively 0 + 0, see defaultPagelessConfig
    : pageHeight - margins.bottom - footerHeight;
  const contentHeight = contentBottom - contentTop;
  const contentWidth = pageWidth - margins.left - margins.right;

  return {
    pageNumber,
    contentTop,
    contentBottom,
    contentHeight,
    contentWidth,
    headerTop: margins.top,
    footerTop: pageHeight - margins.bottom - footerHeight,
    headerHeight,
    footerHeight,
  };
}

/**
 * Constant for the zero-contributor state — no contributions, metricsVersion 0.
 * Used by `runPipeline` as the current default and by tests that need a
 * stable reference without constructing a fresh object every call.
 *
 * Any code that wants to verify "the pipeline is currently running without
 * chrome contributors" can identity-check against this constant.
 */
export const EMPTY_RESOLVED_CHROME: ResolvedChrome = {
  contributions: {},
  metricsVersion: 0,
};
