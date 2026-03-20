import { useEffect, useRef, useCallback } from "react";
import {
  renderPage,
  setupCanvas,
  clearOverlay,
  renderCursor,
  renderSelection,
} from "@inscribe/core";
import type {
  LayoutPage,
  PageConfig,
  CharacterMap,
  TextMeasurer,
  SelectionSnapshot,
  MarkDecorator,
} from "@inscribe/core";

interface PageViewProps {
  page: LayoutPage;
  pageConfig: PageConfig;
  layoutVersion: number;
  currentVersion: () => number;
  measurer: TextMeasurer;
  map: CharacterMap;
  markDecorators: Map<string, MarkDecorator>;
  isVisible: boolean;
  observeRef: (el: HTMLDivElement | null) => void;
  gap: number;
  selection: SelectionSnapshot;
  isFocused: boolean;
  cursorVisible: boolean;
  onPageMouseDown: (x: number, y: number, shiftKey: boolean) => void;
  onPageMouseMove: (x: number, y: number) => void;
}

/**
 * PageView — renders one page of the document onto two stacked canvases.
 *
 * Content canvas  — text (alpha: false, opaque, re-drawn on layout change)
 * Overlay canvas  — selection highlight + cursor (alpha: true, re-drawn on every tick)
 */
export function PageView({
  page,
  pageConfig,
  layoutVersion,
  currentVersion,
  measurer,
  map,
  markDecorators,
  isVisible,
  observeRef,
  gap,
  selection,
  isFocused,
  cursorVisible,
  onPageMouseDown,
  onPageMouseMove,
}: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dprRef = useRef(1);

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    clearOverlay(ctx, pageConfig.pageWidth, pageConfig.pageHeight, dprRef.current);

    if (!selection.empty) {
      const glyphs = map
        .glyphsInRange(selection.from, selection.to)
        .filter((g) => g.page === page.pageNumber);
      renderSelection(ctx, glyphs);
    }

    if (isFocused && cursorVisible) {
      const coords = map.coordsAtPos(selection.head);
      if (coords && coords.page === page.pageNumber) {
        renderCursor(ctx, coords);
      }
    }
  }, [
    pageConfig.pageWidth,
    pageConfig.pageHeight,
    map,
    page.pageNumber,
    selection,
    isFocused,
    cursorVisible,
  ]);

  // Render content canvas when layout changes
  useEffect(() => {
    if (!isVisible) return;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const { dpr } = setupCanvas(canvas, {
      width: pageConfig.pageWidth,
      height: pageConfig.pageHeight,
    });
    dprRef.current = dpr;

    overlay.width = Math.round(pageConfig.pageWidth * dpr);
    overlay.height = Math.round(pageConfig.pageHeight * dpr);
    overlay.style.width = `${pageConfig.pageWidth}px`;
    overlay.style.height = `${pageConfig.pageHeight}px`;

    renderPage({
      ctx: canvas.getContext("2d", { alpha: false })!,
      page,
      pageConfig,
      renderVersion: layoutVersion,
      currentVersion,
      dpr,
      measurer,
      map,
      markDecorators,
      showMarginGuides: true,
    });

    drawOverlay();
  }, [isVisible, page, pageConfig, layoutVersion, currentVersion, measurer, map, drawOverlay]);

  // Redraw overlay on selection / cursor blink
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  return (
    <div
      ref={observeRef}
      style={{
        width: pageConfig.pageWidth,
        height: pageConfig.pageHeight,
        marginBottom: gap,
        boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
        background: "#fff",
        position: "relative",
        flexShrink: 0,
        cursor: "text",
        userSelect: "none",
      }}
      onMouseDown={(e) => {
        e.preventDefault(); // keep focus on hidden textarea
        const rect = e.currentTarget.getBoundingClientRect();
        onPageMouseDown(e.clientX - rect.left, e.clientY - rect.top, e.shiftKey);
      }}
      onMouseMove={(e) => {
        if (e.buttons !== 1) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onPageMouseMove(e.clientX - rect.left, e.clientY - rect.top);
      }}
    >
      {isVisible ? (
        <>
          <canvas
            ref={canvasRef}
            style={{ display: "block", position: "absolute", top: 0, left: 0 }}
          />
          <canvas
            ref={overlayRef}
            style={{
              display: "block",
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
          />
        </>
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#fff" }} />
      )}
    </div>
  );
}
