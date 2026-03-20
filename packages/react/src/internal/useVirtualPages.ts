import { useEffect, useRef, useState, useCallback } from "react";
import type { LayoutPage } from "@inscribe/core";

export interface VirtualPageState {
  visiblePages: Set<number>;
  observePage: (pageNumber: number) => (el: HTMLDivElement | null) => void;
}

/**
 * useVirtualPages — tracks which pages are within the viewport + overscan buffer.
 * Uses IntersectionObserver so pages just outside the viewport start rendering
 * before they scroll into view (eliminates white flash).
 */
export function useVirtualPages(
  pages: LayoutPage[],
  overscan = 500
): VirtualPageState {
  const [visiblePages, setVisiblePages] = useState<Set<number>>(
    () => new Set([1])
  );

  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNumber = Number(entry.target.getAttribute("data-page"));
            if (entry.isIntersecting) next.add(pageNumber);
            else next.delete(pageNumber);
          }
          return next;
        });
      },
      { rootMargin: `${overscan}px`, threshold: 0 }
    );

    for (const el of elementsRef.current.values()) {
      observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [overscan]);

  useEffect(() => {
    setVisiblePages(new Set([1]));
  }, [pages.length]);

  const observePage = useCallback(
    (pageNumber: number) => (el: HTMLDivElement | null) => {
      if (el) {
        el.setAttribute("data-page", String(pageNumber));
        elementsRef.current.set(pageNumber, el);
        observerRef.current?.observe(el);
      } else {
        const prev = elementsRef.current.get(pageNumber);
        if (prev) {
          observerRef.current?.unobserve(prev);
          elementsRef.current.delete(pageNumber);
        }
      }
    },
    []
  );

  return { visiblePages, observePage };
}
