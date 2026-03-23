import { describe, it, expect } from "vitest";
import { layoutDocument, defaultPageConfig, collapseMargins } from "./PageLayout";
import { buildStarterKitContext, createMeasurer, paragraph as p, heading, doc, pageBreak } from "../test-utils";

// lineHeight = 18, contentHeight = 1123 - 72 - 72 = 979


function h1(text: string) {
  return heading(1, text);
}

// ── Basic structure ───────────────────────────────────────────────────────────

describe("layoutDocument — basic", () => {
  it("returns at least one page for an empty doc", () => {
    const layout = layoutDocument(doc(p()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    expect(layout.pages.length).toBeGreaterThanOrEqual(1);
  });

  it("places a short document on one page", () => {
    const layout = layoutDocument(doc(p("Hello world")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0]?.blocks).toHaveLength(1);
  });

  it("increments the version from the previous version", () => {
    const layout = layoutDocument(doc(p()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      previousVersion: 5,
    });
    expect(layout.version).toBe(6);
  });

  it("block y coordinates are page-local (start from margins.top)", () => {
    const layout = layoutDocument(doc(p("Hello")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    const block = layout.pages[0]!.blocks[0]!;
    // First block on page: no spaceBefore (paragraph), so y = margins.top
    expect(block.y).toBe(defaultPageConfig.margins.top);
  });

  it("exposes pageConfig on the layout result", () => {
    const layout = layoutDocument(doc(p()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    expect(layout.pageConfig).toBe(defaultPageConfig);
  });
});

// ── Multiple blocks ───────────────────────────────────────────────────────────

describe("layoutDocument — multiple blocks", () => {
  it("stacks two paragraphs vertically", () => {
    const layout = layoutDocument(doc(p("First"), p("Second")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    const blocks = layout.pages[0]!.blocks;
    expect(blocks).toHaveLength(2);
    // Second block must start below the first
    expect(blocks[1]!.y).toBeGreaterThan(blocks[0]!.y);
  });

  it("applies margin collapsing between heading and paragraph", () => {
    // h1: spaceAfter=12. paragraph: spaceBefore=0. collapsed gap = max(12,0) = 12
    const layout = layoutDocument(doc(h1("Title"), p("Body")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    const [heading, para] = layout.pages[0]!.blocks;
    const gap = para!.y - (heading!.y + heading!.height);
    expect(gap).toBe(12);
  });
});

// ── Hard page break ───────────────────────────────────────────────────────────

describe("layoutDocument — page_break node", () => {
  it("forces content onto a new page", () => {
    const layout = layoutDocument(doc(p("Page 1"), pageBreak(), p("Page 2")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]!.blocks).toHaveLength(1);
    expect(layout.pages[1]!.blocks).toHaveLength(1);
  });

  it("resets y to margins.top on the new page", () => {
    const layout = layoutDocument(doc(p("A"), pageBreak(), p("B")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
    });
    const blockOnPage2 = layout.pages[1]!.blocks[0]!;
    expect(blockOnPage2.y).toBe(defaultPageConfig.margins.top);
  });
});

// ── Soft page break (overflow) ────────────────────────────────────────────────

describe("layoutDocument — overflow", () => {
  it("overflows blocks to a new page when they exceed page height", () => {
    // Use a tiny page: 200px tall, margins 10px = 180px content height
    const tinyPage = {
      pageWidth: 400,
      pageHeight: 200,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    };

    // Each paragraph = 1 line = 18px. 180px / 18px = 10 paragraphs per page.
    // Create 12 paragraphs — should overflow to 2 pages.
    const blocks = Array.from({ length: 12 }, (_, i) => p(`Paragraph ${i + 1}`));
    const layout = layoutDocument(doc(...blocks), {
      pageConfig: tinyPage,
      measurer: createMeasurer(),
    });

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);
  });

  it("resets y to margins.top for overflowed blocks", () => {
    const tinyPage = {
      pageWidth: 400,
      pageHeight: 200,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
    };
    const blocks = Array.from({ length: 15 }, () => p("Text"));
    const layout = layoutDocument(doc(...blocks), {
      pageConfig: tinyPage,
      measurer: createMeasurer(),
    });

    // First block on page 2 should start at margins.top
    const firstBlockPage2 = layout.pages[1]?.blocks[0];
    expect(firstBlockPage2?.y).toBe(10); // margins.top
  });
});

// ── Horizontal rule ───────────────────────────────────────────────────────────

describe("layoutDocument — horizontal rule", () => {
  const { schema: fullSchema, fontConfig: fullFontConfig } = buildStarterKitContext();

  function hr() {
    return fullSchema.nodes["horizontalRule"]!.create();
  }

  function fullDoc(...blocks: ReturnType<typeof fullSchema.node>[]) {
    return fullSchema.node("doc", null, blocks);
  }

  function fullP(text = "") {
    return text
      ? fullSchema.node("paragraph", null, [fullSchema.text(text)])
      : fullSchema.node("paragraph", null, []);
  }

  // HR block style: font "8px Georgia, serif" → height = Math.round(8 × 1.5) = 12
  // spaceBefore = 8, spaceAfter = 8
  const HR_HEIGHT = 12;
  const HR_SPACE  = 8;

  it("HR block has correct height (derived from 8px font)", () => {
    const layout = layoutDocument(fullDoc(hr()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const block = layout.pages[0]!.blocks[0]!;
    expect(block.height).toBe(HR_HEIGHT);
  });

  it("HR is positioned at margins.top when it is the first block", () => {
    const layout = layoutDocument(fullDoc(hr()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const block = layout.pages[0]!.blocks[0]!;
    expect(block.y).toBe(defaultPageConfig.margins.top);
  });

  it("paragraph before HR: HR y accounts for para height and collapsed margin", () => {
    // para: spaceAfter=10.  HR: spaceBefore=8.  collapsed gap = max(10, 8) = 10
    const layout = layoutDocument(fullDoc(fullP("Hello"), hr()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const [para, hrBlock] = layout.pages[0]!.blocks;
    const expectedGap = Math.max(10, HR_SPACE); // 10
    expect(hrBlock!.y).toBe(para!.y + para!.height + expectedGap);
  });

  it("HR before paragraph: para y accounts for HR height and collapsed margin", () => {
    // HR spaceAfter=8.  para: spaceBefore=0.  collapsed gap = max(8, 0) = 8
    const layout = layoutDocument(fullDoc(hr(), fullP("Hello")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const [hrBlock, para] = layout.pages[0]!.blocks;
    const expectedGap = Math.max(HR_SPACE, 0); // 8
    expect(para!.y).toBe(hrBlock!.y + HR_HEIGHT + expectedGap);
  });

  it("HR block lines is empty (leaf node — no inline content)", () => {
    const layout = layoutDocument(fullDoc(hr()), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const block = layout.pages[0]!.blocks[0]!;
    expect(block.lines).toHaveLength(0);
  });
});

// ── List item spacing ─────────────────────────────────────────────────────────

describe("layoutDocument — list item spacing", () => {
  const { schema: fullSchema, fontConfig: fullFontConfig } = buildStarterKitContext();

  function bulletList(...items: string[]) {
    const listItems = items.map((text) =>
      fullSchema.nodes["listItem"]!.create(null, [
        fullSchema.node("paragraph", null, text ? [fullSchema.text(text)] : []),
      ])
    );
    return fullSchema.nodes["bulletList"]!.create(null, listItems);
  }

  function fullDoc(...blocks: ReturnType<typeof fullSchema.node>[]) {
    return fullSchema.node("doc", null, blocks);
  }

  function fullP(text = "") {
    return text
      ? fullSchema.node("paragraph", null, [fullSchema.text(text)])
      : fullSchema.node("paragraph", null, []);
  }

  // list_item block style: spaceAfter=4 (vs paragraph spaceAfter=10)
  // spaceBefore=0 for both, so collapsed gap between two list items = max(4,0) = 4
  it("gap between two list items uses list_item spaceAfter (4), not paragraph spaceAfter (10)", () => {
    const layout = layoutDocument(fullDoc(bulletList("First item", "Second item")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const [first, second] = layout.pages[0]!.blocks;
    const gap = second!.y - (first!.y + first!.height);
    // list_item: spaceAfter=4, spaceBefore=0 → collapsed = 4
    expect(gap).toBe(4);
  });

  it("gap after last list item before a paragraph uses list_item spaceAfter (4)", () => {
    // list_item spaceAfter=4, paragraph spaceBefore=0 → collapsed = 4
    const layout = layoutDocument(fullDoc(bulletList("Only item"), fullP("After")), {
      pageConfig: defaultPageConfig,
      measurer: createMeasurer(),
      fontConfig: fullFontConfig,
    });
    const [listBlock, paraBlock] = layout.pages[0]!.blocks;
    const gap = paraBlock!.y - (listBlock!.y + listBlock!.height);
    expect(gap).toBe(4);
  });
});

// ── collapseMargins helper ────────────────────────────────────────────────────

describe("collapseMargins", () => {
  it("returns the larger of the two margins", () => {
    expect(collapseMargins(20, 10)).toBe(20);
    expect(collapseMargins(10, 20)).toBe(20);
  });

  it("returns the value when both are equal", () => {
    expect(collapseMargins(16, 16)).toBe(16);
  });

  it("returns 0 when both are 0", () => {
    expect(collapseMargins(0, 0)).toBe(0);
  });
});
