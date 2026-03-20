import { useState, useEffect, useRef } from "react";
import { Editor, StarterKit } from "@inscribe/core";
import type { Extension } from "@inscribe/core";

export interface UseCanvasEditorOptions {
  /** Extensions to load. Defaults to [StarterKit]. */
  extensions?: Extension[];
  /**
   * Called on every document or selection change.
   * Mirrors TipTap's onUpdate.
   */
  onUpdate?: (props: { editor: Editor }) => void;
  /** Called when the selection changes (alias for onUpdate, TipTap compat). */
  onSelectionUpdate?: (props: { editor: Editor }) => void;
  /** Called when the editor textarea gains focus. */
  onFocus?: (props: { editor: Editor }) => void;
  /** Called when the editor textarea loses focus. */
  onBlur?: (props: { editor: Editor }) => void;
  /** Called once after the editor instance is created. */
  onCreate?: (props: { editor: Editor }) => void;
  /** Called just before the editor is destroyed. */
  onDestroy?: () => void;
}

/**
 * useCanvasEditor — create and manage an Editor instance.
 *
 * Returns Editor | null (null on first render / during SSR).
 * Pass the returned editor to <Canvas editor={editor} />.
 *
 * @param options  Editor configuration + event callbacks
 * @param deps     Re-create the editor when these values change (default: never)
 *
 * @example
 * const editor = useCanvasEditor({ extensions: [StarterKit] })
 * return <Canvas editor={editor} />
 */
export function useCanvasEditor(
  options: UseCanvasEditorOptions,
  deps: unknown[] = []
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null);

  // Keep callbacks in a ref so they never need to be in the effect deps.
  // Stale-closure safe: options are always read at call time.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const opts = optionsRef.current;

    const instance = new Editor({
      extensions: opts.extensions ?? [StarterKit],
      onChange: (state) => {
        opts.onUpdate?.({ editor: instance });
        opts.onSelectionUpdate?.({ editor: instance });
        // Suppress unused-param warning — state is available if needed
        void state;
      },
      onFocusChange: (focused) => {
        if (focused) opts.onFocus?.({ editor: instance });
        else opts.onBlur?.({ editor: instance });
      },
    });

    setEditor(instance);
    opts.onCreate?.({ editor: instance });

    return () => {
      opts.onDestroy?.();
      instance.destroy();
      setEditor(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return editor;
}
