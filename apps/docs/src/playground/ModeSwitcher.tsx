import { useState } from "react";
import type { Editor } from "@inscribe/core";
import { TrackChangesStatus } from "@inscribe/plugins";

export type EditorMode = "editing" | "suggesting" | "viewing";

const MODES: { value: EditorMode; label: string; icon: string }[] = [
  { value: "editing",    label: "Editing",    icon: "✏️" },
  { value: "suggesting", label: "Suggesting", icon: "✨" },
  { value: "viewing",    label: "Viewing",    icon: "👁" },
];

const MODE_STATUS: Record<EditorMode, TrackChangesStatus> = {
  editing:    TrackChangesStatus.disabled,
  suggesting: TrackChangesStatus.enabled,
  viewing:    TrackChangesStatus.viewSnapshots,
};

interface ModeSwitcherProps {
  editor: Editor | null;
}

export function ModeSwitcher({ editor }: ModeSwitcherProps) {
  const [mode, setMode] = useState<EditorMode>("editing");
  const [open, setOpen] = useState(false);

  const current = MODES.find(m => m.value === mode)!;

  const handleSelect = (next: EditorMode) => {
    setMode(next);
    setOpen(false);
    editor?.commands.setTrackingStatus?.(MODE_STATUS[next]);
  };

  return (
    <div style={styles.wrapper}>
      <button
        style={styles.trigger}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
      >
        <span>{current.icon}</span>
        <span style={styles.label}>{current.label}</span>
        <span style={styles.chevron}>▾</span>
      </button>

      {open && (
        <>
          {/* backdrop to close on outside click */}
          <div style={styles.backdrop} onClick={() => setOpen(false)} />
          <div style={styles.menu}>
            {MODES.map(m => (
              <button
                key={m.value}
                style={{ ...styles.item, ...(m.value === mode ? styles.itemActive : {}) }}
                onMouseDown={e => { e.preventDefault(); handleSelect(m.value); }}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: "relative" as const,
    display: "inline-block",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "0 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 4,
    background: "#f8fafc",
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
    fontWeight: 500,
    userSelect: "none" as const,
  },
  label: {
    minWidth: 68,
    textAlign: "left" as const,
  },
  chevron: {
    fontSize: 11,
    opacity: 0.6,
  },
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 99,
  },
  menu: {
    position: "absolute" as const,
    top: "calc(100% + 4px)",
    left: 0,
    zIndex: 100,
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    minWidth: 140,
    overflow: "hidden",
  },
  item: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    border: "none",
    background: "transparent",
    fontSize: 13,
    color: "#374151",
    cursor: "pointer",
    textAlign: "left" as const,
    fontWeight: 500,
  },
  itemActive: {
    background: "#dbeafe",
    color: "#1d4ed8",
  },
} as const;
