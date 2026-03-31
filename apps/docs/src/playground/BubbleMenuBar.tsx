import { BubbleMenu } from "@inscribe/react";
import type { Editor } from "@inscribe/react";

interface BubbleMenuBarProps {
  editor: Editor | null;
}

type Btn = {
  label: string;
  title: string;
  command: string;
  mark: string;
};

const BUTTONS: Btn[] = [
  { label: "B",  title: "Bold",          command: "toggleBold",          mark: "bold" },
  { label: "I",  title: "Italic",         command: "toggleItalic",        mark: "italic" },
  { label: "U",  title: "Underline",      command: "toggleUnderline",     mark: "underline" },
  { label: "S",  title: "Strikethrough",  command: "toggleStrikethrough", mark: "strikethrough" },
];

export function BubbleMenuBar({ editor }: BubbleMenuBarProps) {
  const activeMarks: string[] = editor?.getActiveMarks() ?? [];
  const hasLink = activeMarks.includes("link");

  return (
    <BubbleMenu editor={editor} className="bubble-menu-bar">
      <div style={styles.bar}>
        {BUTTONS.map(({ label, title, command, mark }) => (
          <button
            key={command}
            title={title}
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.commands[command]?.();
            }}
            style={{
              ...styles.btn,
              ...(activeMarks.includes(mark) ? styles.btnActive : {}),
              ...(label === "B" ? styles.bold : {}),
              ...(label === "I" ? styles.italic : {}),
            }}
          >
            {label}
          </button>
        ))}

        <div style={styles.divider} />

        <button
          title={hasLink ? "Edit link" : "Insert link"}
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.commands.setLink?.();
          }}
          style={{ ...styles.btn, ...(hasLink ? styles.btnActive : {}) }}
        >
          🔗
        </button>

        {hasLink && (
          <button
            title="Remove link"
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.commands.unsetLink?.();
            }}
            style={styles.btn}
          >
            ⛓‍💥
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}

const styles = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "4px 6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  },
  btn: {
    background: "transparent",
    border: "none",
    color: "#cbd5e1",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 5,
    fontSize: 13,
    lineHeight: 1,
    transition: "background 0.1s",
  },
  btnActive: {
    background: "#3b82f6",
    color: "#fff",
  },
  bold: {
    fontWeight: 700,
  },
  italic: {
    fontStyle: "italic" as const,
  },
  divider: {
    width: 1,
    height: 18,
    background: "#334155",
    margin: "0 4px",
  },
} as const;
