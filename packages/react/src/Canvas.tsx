import { useRef, useEffect, useState, useCallback } from "react";
import {
  CharacterMap,
  TextMeasurer,
  layoutDocument,
  defaultPageConfig,
} from "@inscribe/core";
import type {
  Editor,
  PageConfig,
  SelectionSnapshot,
  LayoutPage,
  DocumentLayout,
} from "@inscribe/core";
import { PageView } from "./internal/PageView";
import { useVirtualPages } from "./internal/useVirtualPages";

const DEFAULT_GAP = 24;

export interface CanvasProps {
  /** Editor instance from useCanvasEditor. Renders nothing when null. */
  editor: Editor | null;
  /** Page dimensions and margins. Defaults to A4 with standard margins. */
  pageConfig?: PageConfig;
  /** Gap in pixels between pages. Default: 24. */
  gap?: number;
  /** Virtual scroll overscan in pixels. Default: 500. */
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Canvas — the rendering surface for an Inscribe document.
 *
 * Owns:
 *   - CharacterMap (glyph positions for cursor/click hit-testing)
 *   - TextMeasurer (font metrics)
 *   - Document layout (re-computed on every state change)
 *   - Virtual page rendering via IntersectionObserver
 *
 * Does NOT own:
 *   - The Editor instance — that's useCanvasEditor's responsibility
 *
 * @example
 * const editor = useCanvasEditor({ extensions: [StarterKit] })
 * return <Canvas editor={editor} style={{ padding: 40 }} />
 */
export function Canvas({
  editor,
  pageConfig = defaultPageConfig,
  gap = DEFAULT_GAP,
  overscan = 500,
  className,
  style,
}: CanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const charMapRef = useRef(new CharacterMap());
  const measurerRef = useRef(new TextMeasurer({ lineHeightMultiplier: 1.2 }));
  const versionRef = useRef(0);
  const isDraggingRef = useRef(false);

  const [layout, setLayout] = useState<DocumentLayout | null>(null);
  const [selection, setSelection] = useState<SelectionSnapshot>({
    anchor: 0,
    head: 0,
    from: 0,
    to: 0,
    empty: true,
    activeMarks: [],
    activeMarkAttrs: {},
    blockType: "paragraph",
    blockAttrs: {},
  });
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Mount the editor's hidden textarea into our container div.
  // The textarea is invisible (opacity:0, pointer-events:none) and positioned
  // absolute so it doesn't affect page layout.
  useEffect(() => {
    if (!editor || !mountRef.current) return;
    editor.mount(mountRef.current);
    // No cleanup here — useCanvasEditor owns destroy().
  }, [editor]);

  // Subscribe to all editor notifications:
  //   - State changes (typing, commands) → relayout + update selection
  //   - Focus/blur → update isFocused
  //   - Cursor ticks → update cursorVisible (triggers overlay redraw in PageView)
  useEffect(() => {
    if (!editor) return;

    const update = () => {
      setCursorVisible(editor.cursorManager.isVisible);
      setIsFocused(editor.isFocused);

      const state = editor.getState();
      const charMap = charMapRef.current;
      charMap.clear();

      const next = layoutDocument(state.doc, {
        pageConfig,
        measurer: measurerRef.current,
        fontModifiers: editor.fontModifiers,
        previousVersion: versionRef.current,
      });
      versionRef.current = next.version;
      setLayout(next);

      const blockInfo = editor.getBlockInfo();
      setSelection({
        anchor: state.selection.anchor,
        head: state.selection.head,
        from: state.selection.from,
        to: state.selection.to,
        empty: state.selection.empty,
        activeMarks: editor.getActiveMarks(),
        activeMarkAttrs: editor.getActiveMarkAttrs(),
        blockType: blockInfo.blockType,
        blockAttrs: blockInfo.blockAttrs,
      });
    };

    // Compute initial layout immediately
    update();

    return editor.subscribe(update);
  }, [editor, pageConfig]);

  // Stop drag on mouseup anywhere (user may drag outside the page div)
  useEffect(() => {
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  const getCurrentVersion = useCallback(() => versionRef.current, []);

  const handlePageMouseDown = useCallback(
    (pageNumber: number, x: number, y: number, shiftKey: boolean) => {
      if (!editor) return;
      isDraggingRef.current = true;
      const pos = charMapRef.current.posAtCoords(x, y, pageNumber);
      if (shiftKey) {
        editor.setSelection(editor.getState().selection.anchor, pos);
      } else {
        editor.moveCursorTo(pos);
      }
    },
    [editor]
  );

  const handlePageMouseMove = useCallback(
    (pageNumber: number, x: number, y: number) => {
      if (!isDraggingRef.current || !editor) return;
      const pos = charMapRef.current.posAtCoords(x, y, pageNumber);
      editor.setSelection(editor.getState().selection.anchor, pos);
    },
    [editor]
  );

  const { visiblePages, observePage } = useVirtualPages(
    layout?.pages ?? [],
    overscan
  );

  return (
    <div className={className} style={style}>
      {/* Hidden textarea mount point — positioned absolute, zero visual size */}
      <div
        ref={mountRef}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />

      {/* Page stack */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {layout?.pages.map((page: LayoutPage) => (
          <PageView
            key={page.pageNumber}
            page={page}
            pageConfig={layout.pageConfig}
            layoutVersion={layout.version}
            currentVersion={getCurrentVersion}
            measurer={measurerRef.current}
            map={charMapRef.current}
            markDecorators={editor?.markDecorators ?? new Map()}
            isVisible={visiblePages.has(page.pageNumber)}
            observeRef={observePage(page.pageNumber)}
            gap={gap}
            selection={selection}
            isFocused={isFocused}
            cursorVisible={cursorVisible}
            onPageMouseDown={(x, y, shiftKey) =>
              handlePageMouseDown(page.pageNumber, x, y, shiftKey)
            }
            onPageMouseMove={(x, y) =>
              handlePageMouseMove(page.pageNumber, x, y)
            }
          />
        ))}
      </div>
    </div>
  );
}
