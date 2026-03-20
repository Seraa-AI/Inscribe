import { useSyncExternalStore, useRef, useCallback } from "react";
import type { Editor } from "@inscribe/core";

/** Context passed to the selector function. */
export interface EditorStateContext {
  editor: Editor;
}

export interface UseEditorStateOptions<T> {
  /** The editor instance from useCanvasEditor. */
  editor: Editor | null;
  /**
   * Pure function that derives the values your component needs.
   * Called on every editor notification — keep it cheap.
   *
   * @example
   * selector: (ctx) => ctx.editor.isActive('bold')
   */
  selector: (ctx: EditorStateContext) => T;
  /**
   * Custom equality check. Defaults to Object.is (reference equality).
   * Use shallowEqual for object selectors to avoid unnecessary re-renders.
   *
   * @example
   * equalityFn: shallowEqual
   */
  equalityFn?: (a: T, b: T) => boolean;
}

const UNSET = Symbol("unset");

/**
 * useEditorState — subscribe to editor state with fine-grained re-render control.
 *
 * Uses useSyncExternalStore so React only re-renders when the selected slice
 * of state actually changes — not on every keystroke or cursor blink.
 *
 * Returns null when editor is null (not yet initialized).
 *
 * @example
 * // Re-renders only when bold toggles
 * const isBold = useEditorState({
 *   editor,
 *   selector: (ctx) => ctx.editor.isActive('bold'),
 * })
 *
 * @example
 * // Multiple values — re-renders only when one of these three changes
 * const state = useEditorState({
 *   editor,
 *   selector: (ctx) => ({
 *     isBold: ctx.editor.isActive('bold'),
 *     isItalic: ctx.editor.isActive('italic'),
 *     blockType: ctx.editor.getBlockInfo().blockType,
 *   }),
 *   equalityFn: shallowEqual,
 * })
 */
export function useEditorState<T>(
  options: UseEditorStateOptions<T>
): T | null {
  const { editor, selector, equalityFn = Object.is } = options;

  // Cache the last computed value — returned when the selected slice hasn't changed.
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.subscribe(onStoreChange);
    },
    [editor]
  );

  const getSnapshot = useCallback((): T | null => {
    if (!editor) return null;
    const next = selector({ editor });
    if (
      lastValueRef.current !== UNSET &&
      equalityFn(lastValueRef.current as T, next)
    ) {
      // Same value — return the cached reference so React skips the re-render
      return lastValueRef.current as T;
    }
    lastValueRef.current = next;
    return next;
  }, [editor, selector, equalityFn]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Shallow equality helper for object selectors.
 * Pass as equalityFn when your selector returns a plain object.
 */
export function shallowEqual<T extends Record<string, unknown>>(
  a: T,
  b: T
): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.is(a[k], b[k]));
}
