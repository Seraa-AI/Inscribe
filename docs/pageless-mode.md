# Pageless Mode — Implementation Plan

## Overview

Add a `pageless: boolean` flag to `PageConfig` that switches the editor from
discrete fixed-height pages to a single continuous document rendered via a
**rotating tile manager** — the same technique Google Docs uses in pageless mode.

**Guiding principle**: The ProseMirror model layer, `BlockLayout`, `LineBreaker`,
`CharacterMap`, and the extension system remain **untouched**. Changes are
isolated to `PageLayout`, a new `TileManager`, `Editor` wiring, and the React
adapter.

---

## Architecture Comparison

```
PAGED MODE (current)                    PAGELESS MODE (new)
┌──────────────────┐                    ┌──────────────────────────────┐
│   Page 1 (A4)    │                    │  Outer container             │
│  ┌──────────────┐│                    │  height = totalContentHeight │
│  │content canvas││                    │  ┌────────────────────────┐  │
│  │overlay canvas ││                    │  │ Tile 0 (307px)         │  │
│  └──────────────┘│                    │  │  canvas 885×307 @2x    │  │
├──────────────────┤                    │  ├────────────────────────┤  │
│   Page 2 (A4)    │                    │  │ Tile 1 (307px)         │  │
│  ┌──────────────┐│                    │  │  canvas 885×307 @2x    │  │
│  │content canvas││                    │  ├────────────────────────┤  │
│  │overlay canvas ││                    │  │ Tile 2 (307px)         │  │
│  └──────────────┘│                    │  │  ...recycled pool...   │  │
└──────────────────┘                    │  └────────────────────────┘  │
                                        └──────────────────────────────┘
ViewManager: 1 wrapper per page         TileManager: fixed pool of ~6-8 tiles
IntersectionObserver per page           scroll-based tile positioning
```

---

## Phase 1: Layout Engine

### Step 1 — Extend `PageConfig` with `pageless`

**File**: `packages/core/src/layout/PageLayout.ts`

- Add `pageless?: boolean` to the `PageConfig` interface.
- Export a `defaultPagelessConfig` with sensible defaults:
  ```ts
  export const defaultPagelessConfig: PageConfig = {
    pageWidth: 885,
    pageHeight: 0,   // unused in pageless mode
    margins: { top: 40, right: 73, bottom: 40, left: 73 },
    pageless: true,
  };
  ```
- **Why**: Single flag that the rest of the system checks. Keeping it on
  `PageConfig` means no new interfaces — just one optional boolean.

### Step 2 — Add `totalContentHeight` to `DocumentLayout`

**File**: `packages/core/src/layout/PageLayout.ts`

- Add `totalContentHeight: number` to the `DocumentLayout` interface.
- Paged mode: `pages.length * pageConfig.pageHeight`.
- Pageless mode: final `y` position after the last block + bottom margin.
- **Why**: The tile manager needs this to set the scrollable container height.

### Step 3 — Skip page breaks when `pageless` is true

**File**: `packages/core/src/layout/PageLayout.ts` — `layoutDocument()`

- When `pageConfig.pageless`:
  - Skip the overflow check (`blockBottom > pageBottom`).
  - All blocks land on a single `LayoutPage` with `pageNumber: 1`.
  - `y` grows unbounded.
  - After the loop, set `totalContentHeight = y + margins.bottom`.
- When `!pageConfig.pageless`: existing behavior, zero changes.
- **Why**: Minimal diff. Everything downstream (CharacterMap, BlockLayout)
  works automatically because they don't care about page count.

### Step 4 — Update `Editor` to propagate `pageless` flag

**File**: `packages/core/src/Editor.ts`

- No layout logic changes — `Editor` already passes `pageConfig` to
  `layoutDocument`. The flag flows through automatically.
- Add a convenience getter: `get isPageless(): boolean`.
- **Why**: Adapter code (`ViewManager` / `TileManager`) needs to know
  which rendering mode to use.

---

## Phase 2: Tile Manager

### Step 5 — Create `TileManager`

**File**: `packages/core/src/renderer/TileManager.ts` (new)

This is the pageless equivalent of `ViewManager`. It renders the document
onto a fixed pool of recycled canvas tiles.

#### 5a. Constants and types

```ts
const TILE_HEIGHT = 307;        // CSS pixels per tile (matches Google Docs)
const TILE_POOL_SIZE = 8;       // max tiles alive at once
const OVERSCAN_TILES = 1;       // extra tiles above/below viewport

interface TileEntry {
  wrapper: HTMLDivElement;
  contentCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  dpr: number;
  tileIndex: number;            // which vertical slice (0-based)
  lastPaintedVersion: number;
  assigned: boolean;             // true when positioned in the DOM
}
```

#### 5b. DOM structure

```
outerContainer (editor.mount target)
└── tilesContainer (position: relative; height: totalContentHeight)
    ├── tile div 0 (position: absolute; top: 0; height: TILE_HEIGHT)
    │   ├── content canvas
    │   └── overlay canvas
    ├── tile div 1 (position: absolute; top: 307px; ...)
    │   ...
    └── tile div N
```

The `tilesContainer` height drives the native scrollbar. Tile divs are
absolutely positioned and recycled on scroll.

#### 5c. Core algorithm — `update()`

```
1. Read scrollTop and viewportHeight from the scroll parent.
2. Compute visible tile range:
     firstVisible = floor(scrollTop / TILE_HEIGHT)
     lastVisible  = ceil((scrollTop + viewportHeight) / TILE_HEIGHT)
   Apply overscan: firstVisible -= OVERSCAN_TILES, lastVisible += OVERSCAN_TILES.
   Clamp to [0, totalTiles).
3. For each tile in the pool:
     - If its tileIndex is outside [firstVisible, lastVisible], mark unassigned.
4. For each index in [firstVisible, lastVisible]:
     - If already assigned to a tile entry, skip.
     - Otherwise grab an unassigned tile entry from the pool.
     - Set wrapper.style.top = `${index * TILE_HEIGHT}px`.
     - Set tileEntry.tileIndex = index.
     - Mark assigned, set lastPaintedVersion = -1 (force repaint).
5. For each assigned tile:
     - If lastPaintedVersion !== layout.version, call paintContent().
     - Always call paintOverlay() (cursor blink state changes every tick).
```

#### 5d. `paintContent(tile, layout)`

```
1. Compute tileTop = tile.tileIndex * TILE_HEIGHT.
2. Compute tileBottom = tileTop + TILE_HEIGHT.
3. Find all LayoutBlocks whose y-range overlaps [tileTop, tileBottom].
4. Set up the canvas (setupCanvas at TILE_HEIGHT height, 2x DPR).
5. ctx.save(); ctx.translate(0, -tileTop);   // shift to tile-local coords
6. For each overlapping block: call drawBlock(ctx, block, ...).
7. ctx.restore();
```

The `translate(0, -tileTop)` is the key trick — blocks keep their absolute
y positions from layout; the canvas viewport is shifted so only the tile's
slice is visible.

#### 5e. `paintOverlay(tile)`

Same pattern:
1. Clear overlay canvas.
2. `ctx.translate(0, -tileTop)`.
3. Filter CharacterMap glyphs by `y` range overlapping the tile.
4. Call `renderSelection()` / `renderCursor()` with absolute coords —
   the translate handles the offset.

#### 5f. Mouse events

- `mousedown` on a tile: compute absolute y as `tileTop + (clientY - tileRect.top)`.
  Pass `(x, absoluteY, page: 1)` to `charMap.posAtCoords()`.
- `mousemove` / `mouseup`: same pattern as `ViewManager`.
- **Why page: 1**: In pageless mode all glyphs are on page 1.

#### 5g. Scroll subscription

- Listen to `scroll` event on the nearest scrollable parent.
- Throttle with `requestAnimationFrame` to avoid excessive repaints.
- On scroll → call `update()`.

#### 5h. Editor integration

- Subscribe to editor changes via `editor.subscribe()` (same as ViewManager).
- On state change → call `update()` (layout may have changed tile content).
- Register `editor.setPageElementLookup()` — in pageless mode, return the
  `tilesContainer` for page 1 (used by `syncInputBridge`).

---

## Phase 3: Wire up in Editor + React Adapter

### Step 6 — ViewManager vs TileManager selection

**File**: `packages/core/src/renderer/ViewManager.ts`

- No changes to ViewManager — it stays as-is for paged mode.
- The adapter layer (`Canvas.tsx`) decides which manager to instantiate
  based on `editor.isPageless`.

### Step 7 — Update `Canvas` component

**File**: `packages/react/src/Canvas.tsx`

```ts
useEffect(() => {
  if (!editor || !containerRef.current) return;
  editor.mount(containerRef.current);

  const manager = editor.isPageless
    ? new TileManager(editor, containerRef.current, { tileHeight, overscan })
    : new ViewManager(editor, containerRef.current, { gap, overscan });

  return () => {
    manager.destroy();
    editor.unmount();
  };
}, [editor, gap, overscan, tileHeight]);
```

- Add optional `tileHeight?: number` prop to `CanvasProps` (default 307).
- **Why**: The component is already a thin lifecycle wrapper — one branch.

### Step 8 — Export new types

**Files**: `packages/core/src/renderer/index.ts`, `packages/core/src/index.ts`,
`packages/react/src/index.ts`

- Export `TileManager`, `TileManagerOptions`, `defaultPagelessConfig`.
- **Why**: Consumers need access when using the core package directly.

---

## Phase 4: `syncInputBridge` + Scroll-to-Cursor

### Step 9 — Adapt `syncInputBridge()` for pageless

**File**: `packages/core/src/Editor.ts`

- Current logic: finds the page element via `pageElementLookup(coords.page)`,
  computes offset from page rect.
- Pageless: `pageElementLookup(1)` returns the `tilesContainer`. Coords are
  absolute (y is already relative to the container top), so the offset
  calculation simplifies to `coords.y - scrollTop`.
- Guard with `if (this.isPageless)` branch.

### Step 10 — Adapt `scrollCursorIntoView()` for pageless

**File**: `packages/core/src/Editor.ts`

- Same idea: in pageless mode, cursor y is absolute. Scroll the parent so
  that `coords.y` is within the viewport.
- No per-page lookup needed.

---

## Phase 5: CharacterMap — No Changes Needed

The `CharacterMap` works without modification:

- All glyphs have `page: 1` in pageless mode.
- `posAtCoords(x, y, 1)` finds the right glyph.
- `posAbove()` / `posBelow()` navigate by line index within page 1.
- `glyphsInRange()` returns glyphs regardless of page.
- `coordsAtPos()` returns absolute y — the tile manager offsets it.

---

## Phase 6: Demo + Testing

### Step 11 — Add pageless toggle to demo app

**File**: `apps/demo/src/App.tsx`

- Add a toggle button in the header: "Pageless / Paged".
- Swap `pageConfig` between `defaultPageConfig` and `defaultPagelessConfig`.
- Re-create the editor when the toggle changes (pass `[mode]` as the dep
  to `useCanvasEditor`).

### Step 12 — Unit tests

- `PageLayout.test.ts`: Add test cases for `pageless: true`:
  - All blocks on one page.
  - `totalContentHeight` is correct.
  - No page breaks even with large documents.
- `TileManager` visual tests (if applicable):
  - Tile recycling works (pool size never exceeded).
  - Tiles repaint on scroll.
  - Mouse hit-testing computes correct absolute y.

---

## File Change Summary

| File | Change |
|---|---|
| `packages/core/src/layout/PageLayout.ts` | Add `pageless` to `PageConfig`, `totalContentHeight` to `DocumentLayout`, skip page breaks |
| `packages/core/src/Editor.ts` | Add `isPageless` getter, adapt `syncInputBridge` + `scrollCursorIntoView` |
| `packages/core/src/renderer/TileManager.ts` | **New file** — rotating tile manager |
| `packages/core/src/renderer/PageRenderer.ts` | Extract `drawBlock` if not already importable (minor refactor) |
| `packages/core/src/renderer/index.ts` | Export `TileManager` |
| `packages/core/src/index.ts` | Export `defaultPagelessConfig`, `TileManager` |
| `packages/react/src/Canvas.tsx` | Branch on `editor.isPageless` to pick manager |
| `packages/react/src/index.ts` | Re-export new types |
| `apps/demo/src/App.tsx` | Add pageless/paged toggle |
| Test files | New test cases for pageless layout + tile manager |

## Implementation Order

```
Step 1-3  → Layout (pageless flag + skip page breaks)      ~1 day
Step 4    → Editor getter                                    ~30 min
Step 5    → TileManager (biggest piece)                      ~2-3 days
Step 6-8  → Wiring + exports                                 ~1 hour
Step 9-10 → Input bridge + scroll-to-cursor                  ~2-3 hours
Step 11   → Demo toggle                                      ~30 min
Step 12   → Tests                                            ~1 day
```

**Total estimate**: ~4-5 days of focused work.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Canvas max size (browsers cap at ~16384px height) | Tile manager uses 307px tiles — never hits the limit |
| Text spanning tile boundaries looks clipped | `ctx.translate(-tileTop)` + natural canvas clipping handles this automatically |
| Scroll performance on very long documents | Fixed tile pool (8 entries) + RAF-throttled scroll handler keeps work constant |
| `CharacterMap` linear scans slow down for huge docs | Already a known O(n) concern — same in paged mode. Can index later if needed |
| Cursor blink causes full repaint | Only overlay canvases repaint on blink (content canvas is version-gated) — same as current paged mode |

---

## Open Questions

1. **Tile height**: 307px (Google's value) vs. something tuned to our use case?
   Could make it configurable via `TileManagerOptions`.
2. **Horizontal scrolling**: Pageless mode in Google Docs has a fixed width with
   no horizontal scroll. Should we enforce `overflow-x: hidden`?
3. **Page-break nodes**: If the document contains hard `page_break` nodes,
   should pageless mode render them as visual dividers (horizontal rule) or
   ignore them entirely?
4. **Print**: When printing from pageless mode, should we re-layout in paged
   mode for the print stylesheet?
