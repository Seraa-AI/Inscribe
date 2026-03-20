import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "./schema";
import {
  insertText,
  deleteSelection,
  deleteBackward,
  deleteForward,
  splitBlock,
  applyUndo,
  applyRedo,
} from "./commands";
import { history } from "prosemirror-history";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeState(text = ""): EditorState {
  const plugins = [history()];
  const state = EditorState.create({ schema, plugins });
  if (!text) return state;
  // Insert text at the start
  const tr = insertText(state, text)!;
  return state.apply(tr);
}

function stateWithSelection(text: string, from: number, to: number): EditorState {
  const base = makeState(text);
  const $from = base.doc.resolve(from);
  const $to = base.doc.resolve(to);
  const { TextSelection } = require("prosemirror-state");
  return base.apply(base.tr.setSelection(TextSelection.between($from, $to)));
}

// ── insertText ────────────────────────────────────────────────────────────────

describe("insertText", () => {
  it("inserts text at the cursor position", () => {
    const state = makeState();
    const tr = insertText(state, "hello");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("hello");
  });

  it("replaces a range selection with the inserted text", () => {
    const state = makeState("hello");
    // Select "ello" (positions 2–6 inside the paragraph node)
    const sel = stateWithSelection("hello", 2, 6);
    const tr = insertText(sel, "i");
    expect(tr).not.toBeNull();
    const next = sel.apply(tr!);
    expect(next.doc.textContent).toBe("hi");
  });
});

// ── deleteSelection ───────────────────────────────────────────────────────────

describe("deleteSelection", () => {
  it("returns null when selection is collapsed", () => {
    const state = makeState("hello");
    expect(deleteSelection(state)).toBeNull();
  });

  it("deletes the selected range", () => {
    const sel = stateWithSelection("hello", 2, 4);
    const tr = deleteSelection(sel);
    expect(tr).not.toBeNull();
    const next = sel.apply(tr!);
    expect(next.doc.textContent).toBe("hlo");
  });
});

// ── deleteBackward ────────────────────────────────────────────────────────────

describe("deleteBackward", () => {
  it("returns null when at the start of the document", () => {
    const state = makeState();
    expect(deleteBackward(state)).toBeNull();
  });

  it("deletes one character behind the cursor", () => {
    const state = makeState("abc");
    // cursor is after "abc" — position 4 (doc > paragraph > text)
    const tr = deleteBackward(state);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("ab");
  });

  it("deletes the selection when non-empty", () => {
    const sel = stateWithSelection("hello", 2, 4);
    const tr = deleteBackward(sel);
    expect(tr).not.toBeNull();
    const next = sel.apply(tr!);
    expect(next.doc.textContent).toBe("hlo");
  });
});

// ── deleteForward ─────────────────────────────────────────────────────────────

describe("deleteForward", () => {
  it("deletes one character ahead of the cursor", () => {
    const state = makeState("abc");
    // Move cursor to after the paragraph open token (position 1)
    const { TextSelection } = require("prosemirror-state");
    const $pos = state.doc.resolve(1);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.near($pos)));
    const tr = deleteForward(withCursor);
    expect(tr).not.toBeNull();
    const next = withCursor.apply(tr!);
    expect(next.doc.textContent).toBe("bc");
  });

  it("deletes the selection when non-empty", () => {
    const sel = stateWithSelection("hello", 2, 4);
    const tr = deleteForward(sel);
    expect(tr).not.toBeNull();
    const next = sel.apply(tr!);
    expect(next.doc.textContent).toBe("hlo");
  });
});

// ── splitBlock ────────────────────────────────────────────────────────────────

describe("splitBlock", () => {
  it("splits the current paragraph into two", () => {
    const state = makeState("hello");
    // Move cursor to middle of "hello" — after "he" = position 3
    const { TextSelection } = require("prosemirror-state");
    const $pos = state.doc.resolve(3);
    const withCursor = state.apply(state.tr.setSelection(TextSelection.near($pos)));
    const tr = splitBlock(withCursor);
    expect(tr).not.toBeNull();
    const next = withCursor.apply(tr!);
    expect(next.doc.childCount).toBe(2);
    expect(next.doc.child(0).textContent).toBe("he");
    expect(next.doc.child(1).textContent).toBe("llo");
  });
});

// ── applyUndo / applyRedo ─────────────────────────────────────────────────────

describe("applyUndo", () => {
  it("returns null when there is nothing to undo", () => {
    const state = makeState();
    expect(applyUndo(state)).toBeNull();
  });

  it("undoes the last change", () => {
    const state = makeState("hello");
    const undoTr = applyUndo(state);
    expect(undoTr).not.toBeNull();
    const undone = state.apply(undoTr!);
    expect(undone.doc.textContent).toBe("");
  });
});

describe("applyRedo", () => {
  it("returns null when there is nothing to redo", () => {
    const state = makeState("hello");
    expect(applyRedo(state)).toBeNull();
  });

  it("redoes after an undo", () => {
    const state = makeState("hello");
    const undone = state.apply(applyUndo(state)!);
    const redoTr = applyRedo(undone);
    expect(redoTr).not.toBeNull();
    const redone = undone.apply(redoTr!);
    expect(redone.doc.textContent).toBe("hello");
  });
});
