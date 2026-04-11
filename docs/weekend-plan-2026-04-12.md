# Weekend Implementation Plan — 2026-04-12

**Scope**: land the foundation primitives for the multi-surface architecture so subsequent weekends can build features on a stable base.

**Not in scope this weekend**: HeaderFooter plugin itself, footnotes, comments, marker facility, PDF handler contributions. This weekend is scaffolding.

**Reference docs** (must have been merged before starting):
- `docs/header-footer-plan.md` — Phase-by-phase implementation spec for headers/footers
- `docs/multi-surface-architecture.md` — The broader frame, including `LayoutIterationContext` and `SurfaceRegistry`
- `docs/export-extensibility.md` — The export extension design
- `docs/pagination-model.md` — Pre-existing layout architecture notes

---

## Status tracker

Check off as PRs land. Update "notes during implementation" (§10) with anything unexpected.

| # | Branch | Status | PR link | Notes |
|---|---|---|---|---|
| 0 | `docs/architecture-plans` | ⬜ not started | — | Ship the four design docs |
| 1 | `refactor/layout-primitives` | ⬜ not started | — | **HIGHEST PRIORITY** — Phase 0 |
| 2 | `refactor/split-export-packages` | ⬜ not started | — | M0 — independent |
| 3 | `feat/doc-attr-step` | ⬜ not started | — | Phase 1a — independent |
| 4 | `feat/add-page-chrome-lane` | ⬜ not started | — | Phase 1b — depends on 1 + 3 |
| 5 | `feat/add-exports-lane` | ⬜ not started | — | M1 — depends on 2 + 3 |
| 6 | `feat/surface-registry` | ⬜ not started | — | Phase 1c — stretch goal |

Status legend: ⬜ not started · 🟡 in progress · 🟢 merged · 🔴 blocked

---

## Prerequisites — clean up before starting

The current working tree has uncommitted changes across multiple concerns that need to be sorted before starting refactor branches. Don't let them bleed into the implementation PRs.

```bash
# Inspect the current state
git status

# Current branch: feat/docs-docker-release
# Uncommitted (from prior sessions):
#   M apps/docs/Dockerfile              (unrelated — Docker release work)
#   ?? packages/core/src/extensions/built-in/SignatureField.ts  (unrelated — feature prototype)
# Plus (from design sessions):
#   The four docs in docs/*.md we've been writing
#   Memory updates in ~/.claude/projects/.../memory/

# Separate the docs from the code changes
git stash push --include-untracked -m "prereq: stash all working-tree changes"

git checkout main
git pull origin main

# Create the docs PR branch
git checkout -b docs/architecture-plans
git stash pop

# At this point the stashed changes are back. Commit ONLY the docs.
git add docs/pagination-model.md \
        docs/header-footer-plan.md \
        docs/multi-surface-architecture.md \
        docs/export-extensibility.md \
        docs/weekend-plan-2026-04-12.md
git commit -m "docs: add architecture plans for multi-surface, header-footer, export, pagination"

# Leave Dockerfile + SignatureField.ts uncommitted for now.
# They go back on feat/docs-docker-release later, not in these PRs.
git status  # should show those two files still dirty

# Push and open PR 0
git push -u origin docs/architecture-plans
gh pr create --base main \
  --title "docs: architecture plans for multi-surface, header-footer, export, pagination" \
  --body "$(cat <<'EOF'
## Summary
- Adds `docs/pagination-model.md`, `docs/header-footer-plan.md`, `docs/multi-surface-architecture.md`, `docs/export-extensibility.md`, `docs/weekend-plan-2026-04-12.md`
- Pure documentation, no code changes
- Unblocks the implementation PRs that reference these docs

## Test plan
- [ ] CI passes (should be trivial — docs only)
EOF
)"
```

**Land PR 0 before starting PR 1.** The implementation branches reference these docs in their commit messages and PR descriptions, so it's clean for them to exist on main first.

---

## Recommended order

```
Saturday morning  (fresh brain)  → PR 1  refactor/layout-primitives     [big, high-risk]
Saturday afternoon               → PR 2  refactor/split-export-packages [mechanical]
Saturday evening                 → PR 3  feat/doc-attr-step             [small, easy]
Sunday morning                   → PR 4  feat/add-page-chrome-lane      [depends on 1 + 3]
Sunday midday                    → PR 5  feat/add-exports-lane          [small, depends on 2 + 3]
Sunday afternoon                 → PR 6  feat/surface-registry          [stretch, depends on 3]
```

**Rationale**: PR 1 is the biggest and highest-risk; do it when you're most focused. PR 2 + PR 3 are lower cognitive load for the afternoon. Sunday builds on Saturday's foundation.

**If PR 1 takes longer than expected**: don't skip forward to PR 4, it depends on PR 1. Switch to PR 2 or PR 3 (both independent) to keep momentum. Come back to PR 1 when refreshed.

---

## PR 1 — `refactor/layout-primitives`

**Goal**: per-page `PageMetrics`, `runMiniPipeline`, `fitLinesInCapacity`. **Zero behavior change** — all 459+ existing tests pass unchanged.

**Base**: `main` (after PR 0 merges)
**Estimated**: 4–6 hours
**Risk**: High — touches the layout hot loop in `paginateFlow`

### Setup

```bash
git checkout main
git pull
git checkout -b refactor/layout-primitives
```

### Checklist (in order)

- [ ] **1.1** Create `packages/core/src/layout/PageMetrics.ts`:
  - `PageMetrics` interface (per `docs/header-footer-plan.md` §3.1)
  - `ChromeContribution` interface with `topForPage(n)` / `bottomForPage(n)` / `payload` / `stable`
  - `ResolvedChrome` interface with `contributions: Record<string, ChromeContribution>` and `metricsVersion: number`
  - `computePageMetrics(config: PageConfig, resolved: ResolvedChrome, pageNumber: number): PageMetrics` pure function

- [ ] **1.2** Create `packages/core/src/layout/splitLines.ts`:
  - `fitLinesInCapacity(lines: LayoutLine[], capacity: number): { fitted, rest, fittedHeight }` (~10 lines)
  - Unit test file alongside it with edge cases: 0 lines, 1 line, capacity=0, capacity matches exactly, capacity fits all

- [ ] **1.3** Refactor `paginateFlow` at `packages/core/src/layout/PageLayout.ts:469`:
  - Change signature from `(flows, margins, contentHeight, …, pageless)` to `(flows, pageConfig, resolved, metricsFor, …, pageless)` where `metricsFor: (pageNum: number) => PageMetrics`
  - Add a 1-entry cache inside the function (cachedPage + cachedMetrics) since paginateFlow advances pages sequentially
  - Update all 7 call sites listed in `docs/header-footer-plan.md` §3.2:
    - Line 387 init (`y = margins.top` → `y = metricsFor(1).contentTop`)
    - Line 506 hard page break (`y = margins.top` → `y = metricsFor(pages.length + 1).contentTop`)
    - Line 551 `pageBottom` (`margins.top + contentHeight` → `metricsFor(currentPage.pageNumber).contentBottom`)
    - Line 592 leaf reflow to next page
    - Line 665 split loop advance
    - Line 716 split loop continue
    - Line 661 top-of-page guard (`partStartY === margins.top` → `partStartY === metricsFor(currentPage.pageNumber).contentTop`)

- [ ] **1.4** Refactor `runPipeline` at `PageLayout.ts:357`:
  - Build a placeholder `ResolvedChrome` with zero contributors:
    ```ts
    const resolved: ResolvedChrome = { contributions: {}, metricsVersion: 0 };
    ```
  - (Note: the real `aggregateChrome` loop comes in PR 4; for now just a static empty resolve)
  - Create the `metricsFor` helper and pass it to `paginateFlow`
  - Populate `DocumentLayout.metrics: PageMetrics[]` as pages are built (one entry per page, pushed as `runPipeline` advances)

- [ ] **1.5** Refactor `applyFloatLayout` at `PageLayout.ts:915`:
  - Replace `pass1Result.pageConfig.pageHeight - margins.bottom` (line ~992) with reading from `pass1Result.metrics[pageIdx].contentBottom`
  - This is the "stop reaching into pageConfig directly" fix flagged in the docs

- [ ] **1.6** Update `DocumentLayout` interface:
  - Add `metrics: PageMetrics[]` (replaces the scalar `metrics` concept from earlier drafts)
  - Add `runId: number` (increments per layout run)
  - Add `convergence: "stable" | "exhausted"` (seed with "stable" — the iteration loop isn't built yet)
  - Add `iterationCount: number` (seed with 1)
  - Add `_chromePayloads?: Record<string, unknown>` (empty in PR 1; filled by PR 4's aggregator)

- [ ] **1.7** Update `MeasureCacheEntry` in `PageLayout.ts`:
  - Add `placedRunId?: number`
  - Add `placedContentTop?: number`
  - Remove `placedMetricsVersion` if it exists (superseded by `runId`)
  - Update the Phase 1b cache guard at `PageLayout.ts:733` to check **both** `placedRunId === previousLayout.runId` AND `placedContentTop === metricsFor(currentPage.pageNumber).contentTop`

- [ ] **1.8** Create `packages/core/src/layout/runMiniPipeline.ts`:
  - Export function that shares all internals with `runPipeline` (`buildBlockFlow`, `paginateFlow`, `applyFloatLayout`, `buildFragments`) but forces `pageless: true` and never invokes chrome aggregation
  - In PR 1, the chrome aggregator doesn't exist yet, so `runMiniPipeline` is mostly a thin wrapper. PR 4 will add the `aggregateChrome` call to `runPipeline`, and `runMiniPipeline` must NOT add it.
  - Add the module-level `_chromeDepth` counter to `runPipeline` and the recursion throw (the belt-and-suspenders check from `docs/export-extensibility.md` §6.1)

- [ ] **1.9** Run the full test suite and verify zero behavior change:
  ```bash
  cd packages/core && npx vitest run
  ```
  All 459+ existing tests must pass unchanged.

- [ ] **1.10** Write new unit tests in `packages/core/src/layout/PageMetrics.test.ts`:
  - `computePageMetrics` with zero contributors → values match hand-computed formula on every page
  - `computePageMetrics` with a stub contributor that returns `topForPage(n) = n * 10` → metrics reflect per-page variation
  - `DocumentLayout.metrics` has length equal to `DocumentLayout.pages.length`
  - Phase 1b cache guard: mismatched `placedRunId` invalidates; mismatched `placedContentTop` invalidates; both matching accepts

- [ ] **1.11** Write new unit tests in `packages/core/src/layout/runMiniPipeline.test.ts`:
  - Measures a simple mini-doc and returns correct block heights
  - Never calls `aggregateChrome` (will be validated by the depth counter throw after PR 4 lands — for now just verify it doesn't call into anything chrome-related)
  - Recursion guard throws if called from inside another `runPipeline` (mock this by incrementing depth manually)

- [ ] **1.12** Final test run + commit cleanup:
  ```bash
  cd packages/core && npx vitest run
  pnpm typecheck  # from root
  ```

- [ ] **1.13** Push and open PR:
  ```bash
  git push -u origin refactor/layout-primitives
  gh pr create --base main \
    --title "refactor(layout): per-page PageMetrics + runMiniPipeline + fitLinesInCapacity"
  ```

### Commit discipline within PR 1

Make small commits per checklist item. Suggested commit messages:

- `refactor(layout): add PageMetrics per-page types`
- `refactor(layout): add fitLinesInCapacity shared primitive`
- `refactor(layout): paginateFlow takes per-page metrics via metricsFor helper`
- `refactor(layout): runPipeline populates DocumentLayout.metrics[]`
- `refactor(layout): applyFloatLayout reads from metrics, not pageConfig`
- `refactor(layout): DocumentLayout carries runId + convergence fields`
- `refactor(layout): Phase 1b cache guard checks runId + placedContentTop`
- `refactor(layout): add runMiniPipeline export with recursion guard`
- `test(layout): PageMetrics + runMiniPipeline unit coverage`

If something breaks mid-checklist, bisecting is easy with small commits.

### Likely failure modes

- **Phase 1b cache staleness**: old cached entries with missing `placedRunId`/`placedContentTop` could be silently accepted or rejected. Symptom: incremental re-layout perf regression in tests. Fix: treat missing fields as "cache miss, full re-paginate."
- **Off-by-one on `metricsFor(pages.length + 1)`**: when opening a new page, the page number is `pages.length + 1`, not `currentPage.pageNumber + 1`. Double-check at every new-page site.
- **`DocumentLayout.metrics` length mismatch**: if a test fails because `metrics.length !== pages.length`, check that `runPipeline` pushes a metrics entry every time it creates a new page (including in the streaming/resumption path and the Phase 1b early-termination copy path).

---

## PR 2 — `refactor/split-export-packages`

**Goal**: split `@scrivr/export` into `@scrivr/export-pdf` + `@scrivr/export-markdown`. **No behavior change.**

**Base**: `main` (independent of PR 1)
**Estimated**: 1–2 hours
**Risk**: Low — mechanical file moves

### Setup

```bash
git checkout main
git pull
git checkout -b refactor/split-export-packages
```

### Checklist

- [ ] **2.1** Create `packages/export-pdf/package.json`:
  - `name: "@scrivr/export-pdf"`
  - `dependencies: { "pdf-lib": "^..." }`
  - `peerDependencies: { "@scrivr/core": "workspace:*" }`
  - Copy other fields (scripts, exports, etc.) from the existing `@scrivr/export`

- [ ] **2.2** Create `packages/export-markdown/package.json`:
  - `name: "@scrivr/export-markdown"`
  - `dependencies: { "prosemirror-markdown": "^..." }`
  - `peerDependencies: { "@scrivr/core": "workspace:*" }`

- [ ] **2.3** Move files using `git mv` (preserves history):
  ```bash
  git mv packages/export/src/pdf packages/export-pdf/src
  # Adjust paths as needed — the PDF code may be directly under packages/export/src/
  git mv packages/export/src/markdown packages/export-markdown/src
  ```

- [ ] **2.4** Update imports inside the moved files. Any `../shared/` or internal cross-imports need to be flattened or re-exported.

- [ ] **2.5** Update `packages/export/src/index.ts` as a compat re-export shim:
  ```ts
  export * from "@scrivr/export-pdf";
  export * from "@scrivr/export-markdown";
  ```

- [ ] **2.6** Update root `pnpm-workspace.yaml` if the pattern doesn't already pick up `packages/*` — most likely it does.

- [ ] **2.7** Update `turbo.json` if per-package build configuration is needed.

- [ ] **2.8** Refresh the workspace:
  ```bash
  pnpm install
  ```

- [ ] **2.9** Verify the build:
  ```bash
  pnpm build
  ```

- [ ] **2.10** Run all tests:
  ```bash
  pnpm test
  ```
  Existing PDF tests (moved with the code) should pass unchanged.

- [ ] **2.11** Check that downstream consumers (apps/docs, apps/demo) still build. Their imports should still work via the `@scrivr/export` shim.

- [ ] **2.12** Push and open PR:
  ```bash
  git push -u origin refactor/split-export-packages
  gh pr create --base main \
    --title "refactor(export): split @scrivr/export into @scrivr/export-pdf + @scrivr/export-markdown"
  ```

### Notes

The existing 15 PDF integration tests need to land in the new location. `git mv` preserves them. Verify the test paths work after the move by running `cd packages/export-pdf && npx vitest run`.

---

## PR 3 — `feat/doc-attr-step`

**Goal**: `DocAttrStep` state primitive + `Extension.addDocAttrs()` lane + collision detection. No runtime users yet.

**Base**: `main` (independent)
**Estimated**: 1–2 hours
**Risk**: Low

### Setup

```bash
git checkout main
git pull
git checkout -b feat/doc-attr-step
```

### Checklist

- [ ] **3.1** Create `packages/core/src/state/DocAttrStep.ts`. Take the POC implementation from branch `feat/header-footer`, commit `736ba7d`, file `packages/core/src/extensions/built-in/DocAttrStep.ts`. It's ~50 lines. Copy the implementation but move the file to the new `state/` location:
  - `class DocAttrStep extends Step` with `attr: string` and `value: unknown` constructor params
  - `apply(doc)` returns a new doc with the merged attr
  - `getMap()` returns `StepMap.empty` (attr changes don't shift positions)
  - `invert(doc)` snapshots the previous value as a new `DocAttrStep`
  - `toJSON()` returns `{ stepType: "docAttr", attr, value }`
  - `static fromJSON(schema, json)`
  - `DocAttrStep.jsonID("docAttr", DocAttrStep)` registered with a duplicate-guard try/catch

- [ ] **3.2** Add the whitelist guard to `apply()`:
  - Consult `doc.type.spec.attrs` — if `this.attr` is not in the declared doc attrs, throw with a clear error message
  - This enforces that only attrs contributed via `addDocAttrs()` can be mutated via `DocAttrStep`

- [ ] **3.3** Export from `packages/core/src/index.ts`:
  ```ts
  export { DocAttrStep } from "./state/DocAttrStep";
  ```

- [ ] **3.4** Add `addDocAttrs?(): Record<string, AttributeSpec>` to the `ExtensionConfig` interface in `packages/core/src/extensions/Extension.ts`

- [ ] **3.5** Update `ExtensionManager.buildSchema()` in `packages/core/src/extensions/ExtensionManager.ts`:
  - Add the collision-detecting merge loop from `docs/header-footer-plan.md` §4.1
  - Throws with both owner extension names on collision
  - Merges the resulting `docAttrs` map into the doc node spec additively (don't overwrite existing attrs)

- [ ] **3.6** Add the `DocAttributes` interface extension lane in `packages/core/src/types/augmentation.ts`, mirroring the existing `Commands` lane pattern.

- [ ] **3.7** Create `packages/core/src/state/DocAttrStep.test.ts`:
  - Test: extension contributes `{ foo: { default: null } }`, `DocAttrStep("foo", "bar").apply(doc)` succeeds
  - Test: no extension contributes `baz`, `DocAttrStep("baz", "x").apply(doc)` throws with a clear message
  - Test: `invert()` round-trips (apply → invert → apply produces original)
  - Test: `toJSON()` → `fromJSON()` round-trips
  - Test: `jsonID` registration doesn't throw on duplicate load (test environment safety)

- [ ] **3.8** Create `packages/core/src/extensions/ExtensionManager.test.ts` additions:
  - Test: two extensions with the same `addDocAttrs` key throw with both owner names in the error message
  - Test: two extensions with different `addDocAttrs` keys merge additively
  - Test: `addDocAttrs` contribution doesn't clobber existing doc attrs from other extension lanes

- [ ] **3.9** Verify all tests pass:
  ```bash
  cd packages/core && npx vitest run
  ```

- [ ] **3.10** Push and open PR:
  ```bash
  git push -u origin feat/doc-attr-step
  gh pr create --base main \
    --title "feat(core): DocAttrStep state primitive + addDocAttrs() extension lane"
  ```

---

## PR 4 — `feat/add-page-chrome-lane`

**Goal**: `addPageChrome()` extension lane + iterative aggregator loop + `LayoutIterationContext`. **Zero contributors ship** — headers/footers/footnotes plugins come later.

**Base**: `main` (rebased onto PR 1 + PR 3 after they merge)
**Estimated**: 3–4 hours
**Risk**: Medium

### Setup

```bash
# Wait until PR 1 and PR 3 are merged (or rebase locally onto their branches)
git checkout main
git pull
git checkout -b feat/add-page-chrome-lane
```

### Checklist

- [ ] **4.1** Create `packages/core/src/layout/LayoutIterationContext.ts`:
  - `LayoutIterationContext` interface per `docs/multi-surface-architecture.md` §3.4:
    - `runId`, `iteration`, `maxIterations`
    - `previousIterationPayload: unknown | null`
    - `previousRunPayload: unknown | null`
    - `currentFlowLayout: DocumentLayout | null`
    - `previousRunFlowLayout: DocumentLayout | null`

- [ ] **4.2** Flesh out the chrome types in `packages/core/src/layout/PageMetrics.ts` (or split into a new file):
  - `PageChromeMeasureInput` with `doc`, `pageConfig`, `measurer`, `fontConfig`
  - `PageChromePaintContext` with `ctx`, `pageNumber`, `totalPages`, `metrics`, `pageConfig`, `payload`, `activeSurface`
  - `PageChromeContribution` with `name`, `measure(input, ctx)`, `render(ctx)`
  - Extend `ChromeContribution` from PR 1 with `syntheticPages?: number` (reserved for footnote end-of-doc overflow)

- [ ] **4.3** Create `packages/core/src/layout/aggregateChrome.ts`:
  - Implement `runChromeLoop(flow, config, extensions, runId, prevRunPayloads, prevRunFlowLayout)`
  - Per `docs/multi-surface-architecture.md` §3.4 aggregator loop
  - `MAX_ITERATIONS = 5`
  - Silent graceful degradation on exhaustion: accept last iteration, log `__LAYOUT_DEBUG__` warning, return `convergence: "exhausted"`

- [ ] **4.4** Wire `aggregateChrome` into `runPipeline`:
  - Replace PR 1's zero-contributor placeholder with the real loop
  - Remove the module-level `_chromeDepth` counter? No — keep it; it's the belt-and-suspenders guard against `runMiniPipeline` being misused

- [ ] **4.5** Update `DocumentLayout`:
  - Populate `_chromePayloads: Record<string, unknown>` from the aggregator's final iteration
  - Populate `convergence`, `iterationCount` from the loop result
  - `runId` increments per layout run (not per iteration)

- [ ] **4.6** Add `addPageChrome?(): PageChromeContribution` to `ExtensionConfig`

- [ ] **4.7** Create `packages/core/src/layout/aggregateChrome.test.ts`:
  - Test: zero contributors → loop exits after iteration 1, `convergence: "stable"`, `iterationCount: 1`, `_chromePayloads: {}`
  - Test: single non-iterative contributor (mock "header" returning `stable: true` on iteration 1) → exit after 1, `topForPage` values flow through to `PageMetrics`
  - Test: single iterative contributor that reaches stability after 2 iterations → exit after 2
  - Test: single iterative contributor that never stabilizes → `convergence: "exhausted"`, `iterationCount: 5`
  - Test: two contributors stack correctly — `topForPage` sums, payloads routed by name
  - Test: `previousRunPayload` seeding allows iteration-1 convergence for steady-state
  - Test: `currentFlowLayout` is null on iteration 1, non-null on iteration 2+

- [ ] **4.8** Verify all existing tests pass (regression check):
  ```bash
  cd packages/core && npx vitest run
  ```

- [ ] **4.9** Push and open PR:
  ```bash
  git push -u origin feat/add-page-chrome-lane
  gh pr create --base main \
    --title "feat(core): addPageChrome() extension lane + iterative chrome aggregator"
  ```

---

## PR 5 — `feat/add-exports-lane`

**Goal**: `Extension.addExports()` lane + `FormatHandlers` augmentation pattern. No handlers contributed yet.

**Base**: `main` (after PR 2 and PR 3 merge)
**Estimated**: 1 hour
**Risk**: Low — smallest PR of the weekend

### Setup

```bash
git checkout main
git pull
git checkout -b feat/add-exports-lane
```

### Checklist

- [ ] **5.1** Create `packages/core/src/extensions/export.ts`:
  - `FormatHandlers` interface (empty body — augmented by format packages)
  - `ExportContribution` discriminated union type (from `docs/export-extensibility.md` §4)

- [ ] **5.2** Add `addExports?(): ExportContribution[]` to the `ExtensionConfig` interface

- [ ] **5.3** Create `packages/export-pdf/src/augmentation.ts`:
  - Declare empty `PdfHandlers` interface stub (the real content lands in M2)
  - `declare module "@scrivr/core" { interface FormatHandlers { pdf: PdfHandlers } }`
  - Export nothing — the file is imported for its side effect

- [ ] **5.4** Same for `packages/export-markdown/src/augmentation.ts` with `MarkdownHandlers`

- [ ] **5.5** Import the augmentation file at the entry point of each format package (`src/index.ts`) so the side effect fires when consumers import from the package

- [ ] **5.6** Create `packages/core/src/extensions/export.test.ts`:
  - Test: `Extension.create({ name: "x", addExports: () => [] })` compiles
  - Test: When no format packages are imported, `keyof FormatHandlers` is `never` — can't contribute. When a stub package is loaded, `ExportContribution` has that format in the union.

- [ ] **5.7** Verify the build:
  ```bash
  pnpm build
  cd packages/core && npx vitest run
  ```

- [ ] **5.8** Push and open PR:
  ```bash
  git push -u origin feat/add-exports-lane
  gh pr create --base main \
    --title "feat(core): addExports() extension lane + FormatHandlers augmentation pattern"
  ```

---

## PR 6 — `feat/surface-registry` (STRETCH)

**Goal**: `EditorSurface` primitive + `SurfaceRegistry` + `addSurfaceOwner()` extension lane + `InputBridge` routing. Body is the default active surface — **no user-facing change**.

**Base**: `main` (after PR 3 merges)
**Estimated**: 2–3 hours
**Risk**: Medium — touches `InputBridge`

### Setup

```bash
git checkout main
git pull
git checkout -b feat/surface-registry
```

### Checklist

- [ ] **6.1** Create `packages/core/src/surfaces/EditorSurface.ts`:
  - Per `docs/multi-surface-architecture.md` §4.4.1 and `docs/header-footer-plan.md` §4.4
  - Constructor takes `{ id, owner, schema, initialDocJSON }`
  - Owns `EditorState` + `CharacterMap`
  - Dirty tracking: `get isDirty(): boolean`, set on any `tr.docChanged`
  - `dispatch(tr: Transaction): void`
  - `toDocJSON(): Record<string, unknown>`

- [ ] **6.2** Create `packages/core/src/surfaces/SurfaceRegistry.ts`:
  - `Map<SurfaceId, EditorSurface>` keyed storage
  - `register(surface)`, `unregister(id)`, `get(id)`, `getByOwner(owner)`, `list()`
  - `get activeId(): SurfaceId | null` (null = body active)
  - `get activeSurface(): EditorSurface | null`
  - `activate(id: SurfaceId | null): void` — fires `onSurfaceChange` handlers
  - `onSurfaceChange(handler)` subscription with unsubscribe return

- [ ] **6.3** Add `addSurfaceOwner?(): SurfaceOwnerRegistration` to `ExtensionConfig`:
  - `SurfaceOwnerRegistration` has `{ owner: string, onActivate?, onCommit?, onDeactivate? }`

- [ ] **6.4** Update `Editor.ts`:
  - Add `readonly surfaces: SurfaceRegistry` field, instantiated in constructor
  - `editor.state` **still** returns the flow document's state (do NOT make it return active surface state — see invariant 5 in `docs/multi-surface-architecture.md` §4)
  - Optionally add `editor.activeSurface` accessor for code that needs the active surface directly

- [ ] **6.5** Update `InputBridge` at `packages/core/src/input/InputBridge.ts`:
  - Constructor takes a `registry: SurfaceRegistry` or reads it from the editor
  - `getState`: returns `registry.activeSurface?.state ?? editor.state`
  - `dispatch`: routes to `registry.activeSurface?.dispatch(tr) ?? editor._viewDispatch(tr)`
  - `getCharMap`: same pattern
  - Body is the default — when `activeId === null`, everything routes to the flow document as before

- [ ] **6.6** Create `packages/core/src/surfaces/SurfaceRegistry.test.ts`:
  - Test: register, get, getByOwner
  - Test: activate(null) + activate(id) + activate(null) — onSurfaceChange fires with correct prev/next
  - Test: unregister an active surface — activeId becomes null, onSurfaceChange fires
  - Test: register duplicate id throws

- [ ] **6.7** Create `packages/core/src/surfaces/EditorSurface.test.ts`:
  - Test: constructor initializes state from initialDocJSON
  - Test: dispatch updates state, dirty bit flips on docChanged
  - Test: dispatch with selection-only tr does NOT flip dirty bit
  - Test: toDocJSON round-trips the current state

- [ ] **6.8** Integration test: `Editor` with `SurfaceRegistry`:
  - Body is active by default (activeId === null)
  - `editor.state` returns the flow state regardless of active surface
  - InputBridge routes keystrokes to body when activeId is null

- [ ] **6.9** Run full test suite (regression check — no user-visible change):
  ```bash
  cd packages/core && npx vitest run
  ```

- [ ] **6.10** Push and open PR:
  ```bash
  git push -u origin feat/surface-registry
  gh pr create --base main \
    --title "feat(core): SurfaceRegistry + EditorSurface + addSurfaceOwner() lane"
  ```

---

## Working rules

**Don't skip hooks.** Memory `feedback_no_shortcut_tech_debt.md` applies. If a pre-commit hook fails, fix the underlying issue — never `git commit --no-verify`.

**Run tests from the right directory.** Per memory `feedback_test_runner.md`: always `cd packages/core && npx vitest run` or `pnpm test` from root. Never bare `npx vitest run` from the repo root — it misses `vitest.config.ts` + `setupFiles`.

**Commit often within a PR.** Small commits per checklist item are much easier to bisect if something breaks later. Squash on merge if you want a clean history, but keep the working commits granular.

**Test continuously, not just at the end.** Especially for PR 1. After every refactor step, run tests. If they break, the scope of the break is minimal and easy to find.

**Keep PR 1 atomic.** Splitting it into 1a/1b/1c sounds safer but isn't — the intermediate states don't build or pass tests. Land the whole refactor together.

**If you get blocked on PR 1**, do NOT skip forward to PR 4 — it depends on PR 1. Switch to PR 2 or PR 3 (both independent) to keep momentum. Come back to PR 1 when refreshed.

**No feature work this weekend.** Don't start HeaderFooter, don't start footnotes, don't touch the POC branch. This weekend is scaffolding. Feature weekends come later.

**Don't touch `Dockerfile` or `SignatureField.ts`.** Those are uncommitted on `feat/docs-docker-release` and should stay there. Keep them out of the refactor branches.

---

## Definition of "weekend success"

| Outcome | PRs landed |
|---|---|
| **Minimum acceptable** | PR 0 + PR 1 |
| **Solid weekend** | PR 0 + PR 1 + PR 2 + PR 3 |
| **Strong weekend** | PR 0 through PR 5 |
| **Excellent weekend** | PR 0 through PR 6 |

Even the minimum unblocks everything. If nothing else, **land PR 1**. Per-page `PageMetrics` is the prerequisite for every subsequent feature in the multi-surface roadmap.

---

## What next weekend unblocks

Once PRs 0–5 land, next weekend can start:

- **Phase 2 HeaderFooter plugin** (`feat/header-footer-plugin`) — config + `resolveChrome` via `addPageChrome`, no rendering yet
- **Canvas rendering for HeaderFooter** (`feat/header-footer-render`) — depends on Phase 2 + inline atom dispatch rule
- **M2 export dispatch refactor** (`refactor/export-pdf-dispatch`) — depends on PR 5

Each of those is a separate weekend's work.

Rough trajectory from here:
- **Weekend 2** (next): Phase 2 HeaderFooter config + canvas rendering starts
- **Weekend 3**: HeaderFooter live editing + first-page variant
- **Weekend 4**: HeaderFooter collab + PDF export
- **Weekend 5**: M2 export dispatch refactor + first plugin contributions via `addExports`
- **Weekend 6+**: Marker facility + comments (parallel track), footnotes start

Not a promise — just a rough shape so you know where the weekend investment compounds.

---

## Notes during implementation

Space to accumulate learnings, blockers, and surprises as the weekend progresses. Fill in as you go.

### PR 1 notes

_(empty — add observations here as you work)_

### PR 2 notes

_(empty)_

### PR 3 notes

_(empty)_

### PR 4 notes

_(empty)_

### PR 5 notes

_(empty)_

### PR 6 notes

_(empty)_

---

## References for during implementation

If you get stuck on a specific area, here's where to look:

- **PageMetrics shape and call-site list**: `docs/header-footer-plan.md` §3
- **LayoutIterationContext details**: `docs/multi-surface-architecture.md` §3.4
- **DocAttrStep implementation reference**: commit `736ba7d` on branch `feat/header-footer`, file `packages/core/src/extensions/built-in/DocAttrStep.ts`
- **ExtensionManager collision detection pattern**: `docs/header-footer-plan.md` §4.1
- **SurfaceRegistry spec**: `docs/multi-surface-architecture.md` §4.4 + `docs/header-footer-plan.md` §4.4
- **Convergence semantics**: `docs/multi-surface-architecture.md` §8.6
- **Phase 1b cache guard**: `docs/header-footer-plan.md` §3.4 + `docs/multi-surface-architecture.md` §8.6
- **runMiniPipeline recursion guard**: `docs/export-extensibility.md` §6.1

If a memory file is relevant:
- `feedback_test_runner.md` — test command rules
- `feedback_no_shortcut_tech_debt.md` — don't take shortcuts
- `feedback_pdf_parity.md` — export parity rule (applies later, not this weekend)
- `feedback_convention_alignment.md` — Word/Docs convention defaults
