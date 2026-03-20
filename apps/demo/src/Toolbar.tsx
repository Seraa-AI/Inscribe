import type { ToolbarItemSpec } from "@canvas-editor/core";

interface ToolbarProps {
  items: ToolbarItemSpec[];
  activeMarks: string[];
  onCommand: (cmd: string) => void;
}

/**
 * Toolbar — data-driven toolbar buttons contributed by extensions.
 *
 * Uses onMouseDown + e.preventDefault() so clicks do NOT blur the hidden
 * textarea. Without preventDefault the textarea would lose focus, the
 * blink timer would stop, and keyboard input would stop working.
 */
export function Toolbar({ items, activeMarks, onCommand }: ToolbarProps) {
  return (
    <div style={styles.bar}>
      {items.map((item) => {
        const active = item.isActive(activeMarks);
        return (
          <button
            key={item.command}
            style={{ ...styles.btn, ...(active ? styles.btnActive : {}) }}
            onMouseDown={(e) => { e.preventDefault(); onCommand(item.command); }}
            title={item.title}
            aria-pressed={active}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  bar: {
    display: "flex",
    gap: 4,
    padding: "6px 8px",
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  btn: {
    width: 28,
    height: 28,
    border: "1px solid #cbd5e1",
    borderRadius: 4,
    background: "#f8fafc",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f172a",
    userSelect: "none" as const,
  },
  btnActive: {
    background: "#dbeafe",
    border: "1px solid #3b82f6",
    color: "#1d4ed8",
  },
} as const;
