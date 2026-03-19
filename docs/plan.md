# Canvas Editor — Project Plan

A canvas-based document editor built for legal document workflows.
Designed as a standalone open-source package, with a known production use case (legal SaaS) to validate decisions against.

---

## Why Canvas Over DOM

| Problem | DOM / contenteditable | Canvas |
|---|---|---|
| Pagination | Browser controls layout | We control layout |
| Cross-browser rendering | Each browser differs | Pixel-identical everywhere |
| PDF fidelity | Re-render in headless Chrome | Same render code → PDF |
| Font metrics | Browser-dependent | We measure, we decide |

The core thesis: **the layout engine runs once, output goes anywhere** — screen, PDF, DOCX.

---

## Known Use Case (Legal SaaS)

Building against a real use case prevents designing in a vacuum.

Document types:
- Contracts, briefs, pleadings
- Templates with variable substitution
- Form-driven documents consumed through workflows

Hard requirements:
- Pagination must be exact and consistent across browsers
- PDF export must be pixel-identical to screen
- DOCX export must include track changes (OOXML `<w:ins>` / `<w:del>`)
- Form fields (text inputs, checkboxes) embedded within document flow
- Comments and annotations
- Signature capture

---

## Package Structure

```
canvas-editor/ (pnpm workspace)
├── packages/
│   ├── core/          — model, layout, renderer, input
│   ├── plugins/       — track-changes, comments, form-fields, signatures
│   ├── export/        — pdf, docx
│   └── react/         — React bindings
└── docs/              — this plan and architecture notes
```

### Dependency graph

```
react  →  core
plugins →  core
export  →  core
```

`core` has zero dependencies. Everything else depends on it.

---

## Architecture

### Data flow

```
Document Model
      ↓
 Layout Engine        ← the hard part; owns all text measurement
      ↓
  Render Tree         ← positioned boxes, glyphs, page assignments
      ↓
 ┌────┴────┐
Canvas   PDF/DOCX     ← same render tree, different output targets
```

### Core subsystems

#### 1. Document Model (`core/model`)
- Powered by `prosemirror-model`, `prosemirror-state`, `prosemirror-transform`
- `prosemirror-view` is **never used** — we never give ProseMirror a DOM node
- We define a ProseMirror Schema: paragraph, heading (h1–h6), list, table, page-break, form-field nodes
- Marks: bold, italic, underline, strikethrough, link, font-size, font-family, color
- `EditorState` holds the doc + selection as ProseMirror integer positions
- All edits go through ProseMirror `Transaction`s dispatched to `EditorState`
- Undo/redo via `prosemirror-history` plugin
- The layout engine reads the ProseMirror doc tree — it never writes to it

#### 2. Layout Engine (`core/layout`)
- **TextMeasurer**: wraps `canvas.measureText()`, caches by font+text key
- **LineBreaker**: greedy word-wrap algorithm, respects inline span boundaries
- **BlockLayout**: stacks lines vertically, applies paragraph spacing
- **PageLayout**: assigns blocks to pages, handles orphans/widows, headers/footers
- Input: document model + page config (width, height, margins)
- Output: render tree (all positions absolute, all text measured)

#### 3. Renderer (`core/renderer`)
- Accepts a render tree + `CanvasRenderingContext2D`
- Draws text spans at their absolute positions
- Draws selection rectangles (semi-transparent overlay)
- Draws cursor (1px vertical line, blinks via `requestAnimationFrame`)
- Dirty region tracking — only redraws changed areas

#### 4. Input Handler (`core/input`)
- **Hidden textarea (the bridge)**: an invisible `<textarea>` positioned at the virtual cursor. The browser handles all native input, autocomplete, and IME composition into it. We read the value and dispatch ProseMirror transactions. This is exactly how Google Docs handles input.
- **Keyboard**: `keydown` on the hidden textarea → ProseMirror `Transaction` → new `EditorState` → re-render
- **IME**: `compositionstart` / `compositionupdate` / `compositionend` on the hidden textarea. Show in-progress composition on canvas; commit on `compositionend`.
- **Mouse**: click gives `(x, y)` → `CharacterMap.posAtCoords()` → ProseMirror position → `EditorState` selection update
- **Clipboard**: intercept `copy`/`cut`/`paste` on the hidden textarea, serialize/deserialize doc slice

---

## Roadmap

### Phase 1 — Proof of Concept (Weekends, ~4–6 sessions)
**Goal:** Render a document on canvas with correct pagination. No editing yet.

- [ ] Define core TypeScript types: `Doc`, `Block`, `Span`, `Mark`, `PageConfig`
- [ ] Implement `TextMeasurer` with caching
- [ ] Implement `LineBreaker` — greedy word wrap for a single block
- [ ] Implement `BlockLayout` — lay out a paragraph's lines
- [ ] Implement `PageLayout` — assign blocks to pages with boundary detection
- [ ] Implement basic `CanvasRenderer` — draw text only
- [ ] Manual test: render a 5-page plain text document, verify identical output in Chrome/Firefox/Safari

**Success criteria:** Same pixel output across all three browsers for a static document.

**Key bets to validate:**
- `canvas.measureText()` gives accurate enough metrics for sub-pixel line decisions
- Font loading can be locked down (same font client and server-side)
- Rendering a 50-page doc is fast enough for real-time use

---

### Phase 2 — Interactive Editing (~6–8 sessions)
**Goal:** A user can type, select, and edit text.

- [ ] Cursor model: document position → pixel position (via render tree)
- [ ] Cursor rendering with blink
- [ ] Keyboard input → insert/delete operations
- [ ] IME support via hidden textarea
- [ ] Click → hit test → cursor placement
- [ ] Click + drag → selection
- [ ] Shift+click, double-click (word), triple-click (line) selection
- [ ] Copy/paste (plain text first)
- [ ] Undo/redo (operation stack)

**Success criteria:** Type a paragraph, bold some words, select text, delete it, undo.

---

### Phase 3 — Legal Document Primitives (~4–6 sessions)
**Goal:** Feature parity with a standard legal document schema.

- [ ] Headings (h1–h6) with correct spacing
- [ ] Ordered and unordered lists with indentation
- [ ] Tables (fixed column widths, border rendering)
- [ ] Page headers and footers (with page number token)
- [ ] Embedded form fields (text input, checkbox, date picker) within document flow
- [ ] Comments/annotations (sidebar annotations linked to doc ranges)
- [ ] Track changes model (insert/delete marks with author + timestamp)

**Success criteria:** Reproduce a standard contract with headings, clauses, signature lines, and form fields.

---

### Phase 4 — Export Layer (~3–4 sessions)
**Goal:** PDF and DOCX output that matches screen exactly.

#### PDF
- [ ] Use the same layout engine output (render tree) as the canvas renderer
- [ ] Write a `PDFRenderer` that accepts render tree → outputs PDF using `pdfkit` or raw PDF primitives
- [ ] Embed fonts to guarantee fidelity
- [ ] No headless Chrome dependency — layout is already done

#### DOCX
- [ ] Map document model → OOXML XML structure
- [ ] Handle track changes: insertions as `<w:ins>`, deletions as `<w:del>`
- [ ] Use `pizzip` for building the `.docx` zip archive
- [ ] Test round-trip: export → open in Word/LibreOffice → verify

**Success criteria:** Export a tracked-changes document to DOCX, open in Microsoft Word, accept/reject changes correctly.

---

### Phase 5 — Open Source Release
- [ ] Write API documentation
- [ ] Build a demo/playground (Vite app in `/demo`)
- [ ] Write migration guide from ProseMirror
- [ ] Publish packages to npm under `@canvas-editor/*`
- [ ] Evaluate bringing into the production legal SaaS app

---

## Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Monorepo tool | pnpm workspaces | Lightweight, fast, good workspace protocol support |
| Language | TypeScript strict mode | Legal SaaS context; type safety is non-negotiable |
| Document model | `prosemirror-model` + `prosemirror-state` + `prosemirror-transform` | Battle-tested position tracking, schema validation, undo history — free. We only drop `prosemirror-view`. |
| `prosemirror-view` | Not used | This is the part that touches the DOM. Dropping it means we never fight the browser for layout control. |
| Input bridge | Hidden `<textarea>` | Browser captures keystrokes and IME composition; we read from it and dispatch ProseMirror transactions. Exactly how Google Docs works. |
| Hit testing | CharacterMap (glyph index) | Layout engine writes every glyph's `(x, y, width, docPos)` into a lookup structure. Click → page → line → closest char → ProseMirror position. |
| PDF strategy | Same layout engine → PDFRenderer | Eliminates fidelity gap; no headless Chrome needed |
| DOCX strategy | Custom OOXML serializer | Full control over track changes format |
| React bindings | Separate package, peer dep | Core stays framework-agnostic |
| Fabric.js / Konva.js | Not used as core | No text flow engine; would still need to build layout ourselves |

---

## Open Questions

- Should `TextMeasurer` fall back gracefully if a font hasn't loaded yet, or block layout until fonts are ready?
- How do we handle bidirectional text (RTL) for international legal documents?
- Collaborative editing (OT vs CRDT) — out of scope for v1, but model should not make it impossible
- Accessibility: what is the minimum viable hidden DOM / ARIA implementation?
- Should the demo app be a separate package in the workspace or a standalone Vite app?

---

## Working Sessions Log

| Date | Phase | What was done |
|---|---|---|
| — | Setup | Project scaffolded, plan written |
