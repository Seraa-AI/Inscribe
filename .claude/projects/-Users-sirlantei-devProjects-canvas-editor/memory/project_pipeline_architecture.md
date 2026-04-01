---
name: Layout Pipeline Architecture plan
description: Plan to refactor monolithic layoutDocument() into 6 independent pipeline stages — next major work item
type: project
---

Next up: implement the layout pipeline architecture described in `docs/layout-pipeline-architecture.md`.

**Why:** Enables tables, columns, footnotes, collaborative reflow, and break rules (widow/orphan). Also makes complex bugs easier to isolate since each stage is independent and pure.

**Current branch:** `layout-fragment-architecture` (already committed Phase 1 + 2 of fragment work, which is the stepping stone to this).

**Migration steps (each independently shippable):**
1. Extract `buildBlockFlow()` — block stacking loop from Pass 1, with `inputHash` diffing replacing `placedTargetY + placedPage` cache check
2. Extract `applyFloatLayout()` — lifts Passes 2–4, `ExclusionManager` scoped per call
3. Extract `paginateFlow()` — pure geometry, line-splitting logic, break rules live here
4. Wire new pipeline driver in `LayoutCoordinator` replacing `layoutDocument()` call

**Key new type:** `FlowBlock` — blocks with continuous Y positions before pages or floats are applied. `inputHash` field enables O(1) remeasure + O(N) Y-restack for collaborative edits.

**Start with Step 1:** Run `buildBlockFlow()` in parallel with existing `layoutDocument()`, assert identical output, then remove old path.

**Why:** User noted this also helps debugging since each stage is independent. Plan to start tomorrow.
