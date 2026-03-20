import { describe, it, expect, beforeEach, vi } from "vitest";
import { Editor } from "./Editor";
import type { EditorState } from "prosemirror-state";

/**
 * Editor tests — cursor movement, selection, and edge case safety.
 *
 * We mount the editor into a real (happy-dom) div so the textarea is
 * available, then simulate input via the textarea to seed document content.
 *
 * All assertions go through editor.getState().selection so we stay
 * framework-agnostic and don't depend on the canvas or layout engine.
 */

// Mock canvas so Editor's imports (CharacterMap, etc.) don't blow up
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 3,
    })),
    font: "",
  } as unknown as CanvasRenderingContext2D);
});

function makeEditor() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let latestState: EditorState | null = null;
  const editor = new Editor({
    onChange: (s) => { latestState = s; },
  });
  editor.mount(container);

  /** Type text into the editor via textarea simulation */
  function type(text: string) {
    const ta = container.querySelector("textarea")!;
    ta.value = text;
    ta.dispatchEvent(new Event("input"));
  }

  function cleanup() {
    editor.destroy();
    container.remove();
  }

  return {
    editor,
    type,
    cleanup,
    getState: () => latestState ?? editor.getState(),
  };
}

// ── moveCursorTo ─────────────────────────────────────────────────────────────

describe("Editor.moveCursorTo", () => {
  it("does not throw when called with position 0", () => {
    const { editor, cleanup } = makeEditor();
    expect(() => editor.moveCursorTo(0)).not.toThrow();
    cleanup();
  });

  it("clamps to a valid position when called with a negative number", () => {
    const { editor, cleanup } = makeEditor();
    expect(() => editor.moveCursorTo(-999)).not.toThrow();
    cleanup();
  });

  it("clamps to a valid position when called beyond doc end", () => {
    const { editor, cleanup } = makeEditor();
    expect(() => editor.moveCursorTo(999999)).not.toThrow();
    cleanup();
  });

  it("places the cursor at a valid position inside the document", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    // "Hello" in one paragraph: positions 1-5 are the characters
    editor.moveCursorTo(3);
    const sel = editor.getState().selection;
    expect(sel.empty).toBe(true);
    expect(sel.head).toBeGreaterThanOrEqual(1);
    cleanup();
  });
});

// ── setSelection ─────────────────────────────────────────────────────────────

describe("Editor.setSelection", () => {
  it("creates a non-collapsed selection", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(1, 4);
    const sel = editor.getState().selection;
    expect(sel.empty).toBe(false);
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(4);
    cleanup();
  });

  it("anchor and head can be reversed (backward selection)", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(4, 1);
    const sel = editor.getState().selection;
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(4);
    expect(sel.anchor).toBe(4);
    expect(sel.head).toBe(1);
    cleanup();
  });

  it("equal anchor and head collapses to a cursor", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(3, 3);
    const sel = editor.getState().selection;
    expect(sel.empty).toBe(true);
    cleanup();
  });

  it("does not throw with out-of-range positions", () => {
    const { editor, cleanup } = makeEditor();
    expect(() => editor.setSelection(0, 999)).not.toThrow();
    cleanup();
  });
});

// ── moveLeft / moveRight ──────────────────────────────────────────────────────

describe("Editor.moveLeft / moveRight", () => {
  it("moveRight advances the cursor by one position", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.moveCursorTo(1);
    const before = editor.getState().selection.head;
    editor.moveRight();
    const after = editor.getState().selection.head;
    expect(after).toBeGreaterThan(before);
    cleanup();
  });

  it("moveLeft moves the cursor back by one position", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.moveCursorTo(3);
    const before = editor.getState().selection.head;
    editor.moveLeft();
    const after = editor.getState().selection.head;
    expect(after).toBeLessThan(before);
    cleanup();
  });

  it("moveLeft at the document start is a no-op", () => {
    const { editor, cleanup } = makeEditor();
    // Move to start
    editor.moveCursorTo(1);
    const before = editor.getState().selection.head;
    editor.moveLeft();
    const after = editor.getState().selection.head;
    expect(after).toBe(before);
    cleanup();
  });

  it("moveRight at the document end is a no-op", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hi");
    const docSize = editor.getState().doc.content.size;
    editor.moveCursorTo(docSize);
    const before = editor.getState().selection.head;
    editor.moveRight();
    const after = editor.getState().selection.head;
    expect(after).toBe(before);
    cleanup();
  });

  it("moveRight(true) extends the selection rightward", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.moveCursorTo(2);
    const anchor = editor.getState().selection.anchor;
    editor.moveRight(true);
    const sel = editor.getState().selection;
    expect(sel.empty).toBe(false);
    expect(sel.anchor).toBe(anchor); // anchor does not move
    expect(sel.head).toBeGreaterThan(anchor);
    cleanup();
  });

  it("moveLeft(true) extends the selection leftward", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.moveCursorTo(4);
    const anchor = editor.getState().selection.anchor;
    editor.moveLeft(true);
    const sel = editor.getState().selection;
    expect(sel.empty).toBe(false);
    expect(sel.anchor).toBe(anchor); // anchor does not move
    expect(sel.head).toBeLessThan(anchor);
    cleanup();
  });

  it("typing replaces the active selection", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(1, 4); // select "Hel"
    type("X");                  // type replaces selection
    expect(editor.getState().doc.textContent).toBe("Xlo");
    cleanup();
  });
});

// ── paste ────────────────────────────────────────────────────────────────────

describe("Editor — paste", () => {
  function paste(container: HTMLElement, text: string) {
    const ta = container.querySelector("textarea")!;
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    event.clipboardData!.setData("text/plain", text);
    ta.dispatchEvent(event);
  }

  it("inserts pasted plain text at the cursor", () => {
    const { editor, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    paste(container, "Hello");
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("replaces the active selection with pasted text", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");
    editor.setSelection(1, 4); // select "Hel"
    paste(container, "X");
    expect(editor.getState().doc.textContent).toBe("Xlo");
    cleanup();
  });

  it("does nothing when paste data is empty", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");
    const before = editor.getState().doc.textContent;
    paste(container, "");
    expect(editor.getState().doc.textContent).toBe(before);
    cleanup();
  });
});

// ── getActiveMarks ───────────────────────────────────────────────────────────

describe("Editor.getActiveMarks", () => {
  it("returns empty array when cursor is in plain text", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.moveCursorTo(3);
    expect(editor.getActiveMarks()).toEqual([]);
    cleanup();
  });

  it("returns ['bold'] after toggling bold with cursor collapsed", () => {
    const { editor, cleanup } = makeEditor();
    editor.commands["toggleBold"]?.();
    expect(editor.getActiveMarks()).toContain("bold");
    cleanup();
  });

  it("returns ['bold'] when entire selection is bold", () => {
    const { editor, type, cleanup } = makeEditor();
    // Apply bold to "Hello" by selecting it then toggling
    type("Hello");
    editor.setSelection(1, 6);
    editor.commands["toggleBold"]?.();
    editor.setSelection(1, 6);
    expect(editor.getActiveMarks()).toContain("bold");
    cleanup();
  });

  it("does not return 'bold' when selection is mixed (some plain, some bold)", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    // Bold only "Hel" (positions 1-4)
    editor.setSelection(1, 4);
    editor.commands["toggleBold"]?.();
    // Now select the full word including non-bold part
    editor.setSelection(1, 6);
    expect(editor.getActiveMarks()).not.toContain("bold");
    cleanup();
  });

  it("returns ['italic'] after toggling italic", () => {
    const { editor, cleanup } = makeEditor();
    editor.commands["toggleItalic"]?.();
    expect(editor.getActiveMarks()).toContain("italic");
    cleanup();
  });

  it("returns both marks when bold and italic are both active", () => {
    const { editor, cleanup } = makeEditor();
    editor.commands["toggleBold"]?.();
    editor.commands["toggleItalic"]?.();
    const marks = editor.getActiveMarks();
    expect(marks).toContain("bold");
    expect(marks).toContain("italic");
    cleanup();
  });
});

// ── CursorManager integration ────────────────────────────────────────────────

describe("Editor — CursorManager", () => {
  it("cursorManager.isVisible is true after construction", () => {
    const { editor, cleanup } = makeEditor();
    // CursorManager starts in visible state (timer not yet running, but visible=true)
    expect(editor.cursorManager.isVisible).toBe(true);
    cleanup();
  });

  it("cursorManager.reset() keeps isVisible true and restarts timer", () => {
    const { editor, cleanup } = makeEditor();
    editor.cursorManager.reset();
    expect(editor.cursorManager.isVisible).toBe(true);
    editor.cursorManager.stop();
    cleanup();
  });
});

// ── Heading commands ─────────────────────────────────────────────────────────

describe("Editor — heading commands", () => {
  it("setHeading1 converts the current paragraph to h1", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["setHeading1"]?.();
    const info = editor.getBlockInfo();
    expect(info.blockType).toBe("heading");
    expect(info.blockAttrs["level"]).toBe(1);
    cleanup();
  });

  it("setParagraph converts a heading back to paragraph", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["setHeading1"]?.();
    editor.commands["setParagraph"]?.();
    const info = editor.getBlockInfo();
    expect(info.blockType).toBe("paragraph");
    cleanup();
  });

  it("getBlockInfo returns paragraph for plain text", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    const info = editor.getBlockInfo();
    expect(info.blockType).toBe("paragraph");
    cleanup();
  });
});

// ── List commands ─────────────────────────────────────────────────────────────

describe("Editor — list commands", () => {
  it("toggleBulletList wraps a paragraph into a bullet list", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("bulletList");
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("toggleBulletList a second time removes the list (toggle off)", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleBulletList"]?.();
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("paragraph");
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("toggleOrderedList wraps a paragraph into an ordered list", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleOrderedList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("orderedList");
    cleanup();
  });

  it("toggleOrderedList a second time removes the list (toggle off)", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleOrderedList"]?.();
    editor.commands["toggleOrderedList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("paragraph");
    cleanup();
  });

  it("toggleOrderedList while in a bullet list converts to ordered list", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("bulletList");
    editor.commands["toggleOrderedList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("orderedList");
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("toggleBulletList while in an ordered list converts to bullet list", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleOrderedList"]?.();
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("bulletList");
    cleanup();
  });

  it("getBlockInfo returns bulletList when cursor is inside a bullet list", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("bulletList");
    cleanup();
  });

  it("getBlockInfo returns paragraph after list is removed", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.commands["toggleBulletList"]?.();
    editor.commands["toggleBulletList"]?.();
    expect(editor.getBlockInfo().blockType).toBe("paragraph");
    cleanup();
  });
});

// ── Underline / Strikethrough ─────────────────────────────────────────────────

describe("Editor — underline and strikethrough", () => {
  it("toggleUnderline adds underline mark", () => {
    const { editor, cleanup } = makeEditor();
    editor.commands["toggleUnderline"]?.();
    expect(editor.getActiveMarks()).toContain("underline");
    cleanup();
  });

  it("toggleStrikethrough adds strikethrough mark", () => {
    const { editor, cleanup } = makeEditor();
    editor.commands["toggleStrikethrough"]?.();
    expect(editor.getActiveMarks()).toContain("strikethrough");
    cleanup();
  });

  it("typing after toggleUnderline produces text with underline mark", () => {
    const { editor, type, cleanup } = makeEditor();
    editor.commands["toggleUnderline"]?.();
    type("Hello");
    let foundUnderline = false;
    editor.getState().doc.descendants((node) => {
      if (node.isText) {
        if (node.marks.some((m) => m.type.name === "underline")) foundUnderline = true;
      }
    });
    expect(foundUnderline).toBe(true);
    cleanup();
  });

  it("typing after toggleStrikethrough produces text with strikethrough mark", () => {
    const { editor, type, cleanup } = makeEditor();
    editor.commands["toggleStrikethrough"]?.();
    type("Hello");
    let foundStrikethrough = false;
    editor.getState().doc.descendants((node) => {
      if (node.isText) {
        if (node.marks.some((m) => m.type.name === "strikethrough")) foundStrikethrough = true;
      }
    });
    expect(foundStrikethrough).toBe(true);
    cleanup();
  });

  it("toggling underline on a selection marks all text nodes", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(1, 6);
    editor.commands["toggleUnderline"]?.();
    let allUnderlined = true;
    editor.getState().doc.descendants((node) => {
      if (node.isText && node.text) {
        if (!node.marks.some((m) => m.type.name === "underline")) allUnderlined = false;
      }
    });
    expect(allUnderlined).toBe(true);
    cleanup();
  });

  it("toggling strikethrough off removes the mark", () => {
    const { editor, type, cleanup } = makeEditor();
    type("Hello");
    editor.setSelection(1, 6);
    editor.commands["toggleStrikethrough"]?.();
    // toggleStrikethrough again should remove it
    editor.setSelection(1, 6);
    editor.commands["toggleStrikethrough"]?.();
    expect(editor.getActiveMarks()).not.toContain("strikethrough");
    cleanup();
  });
});

// ── keyboard event dispatch ───────────────────────────────────────────────────
// These tests guard against regressions where a keymap command runs but
// e.preventDefault() is not called, causing the browser's default textarea
// behaviour to also fire (e.g. Enter inserts "\n" as text, Tab shifts focus).

describe("Editor — keyboard event handling", () => {
  /** Fire a keydown on the textarea and return the event (so callers can
   *  check .defaultPrevented). */
  function pressKey(
    container: HTMLElement,
    key: string,
    opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {}
  ): KeyboardEvent {
    const ta = container.querySelector("textarea")!;
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    ta.dispatchEvent(event);
    return event;
  }

  it("Enter inside a list calls splitListItem and prevents default", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;

    editor.commands["toggleBulletList"]?.();
    type("Hello");

    const docBefore = editor.getState().doc.toString();
    const event = pressKey(container, "Enter");

    // Default must be prevented — no "\n" leaks into handleInput
    expect(event.defaultPrevented).toBe(true);
    // List item was split — doc structure changed
    expect(editor.getState().doc.toString()).not.toBe(docBefore);
    // textContent must still be "Hello", not "Hello\n"
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("Enter outside a list prevents default and does not insert newline text", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");

    const event = pressKey(container, "Enter");

    // splitBlock is registered — default must be prevented
    expect(event.defaultPrevented).toBe(true);
    // No literal "\n" must appear in the document text
    expect(editor.getState().doc.textContent).not.toContain("\n");
    cleanup();
  });

  it("Tab is always prevented regardless of context (never shifts browser focus)", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");

    const event = pressKey(container, "Tab");
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });

  it("Tab outside a list is prevented and inserts no text", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");

    pressKey(container, "Tab");
    // No tab character must appear in the document
    expect(editor.getState().doc.textContent).toBe("Hello");
    cleanup();
  });

  it("Tab inside a list is prevented and inserts no text", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;

    editor.commands["toggleBulletList"]?.();
    type("Item 1");
    pressKey(container, "Enter");
    type("Item 2");

    const event = pressKey(container, "Tab");
    expect(event.defaultPrevented).toBe(true);
    // No tab character must appear in the document
    expect(editor.getState().doc.textContent).not.toContain("\t");
    cleanup();
  });

  it("Shift-Tab is always prevented", () => {
    const { editor, type, cleanup } = makeEditor();
    const container = editor["container"] as HTMLElement;
    type("Hello");

    const event = pressKey(container, "Tab", { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });
});
