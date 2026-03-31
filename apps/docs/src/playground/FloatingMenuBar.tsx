import { useState } from "react";
import { FloatingMenu } from "@inscribe/react";
import type { Editor } from "@inscribe/react";

interface FloatingMenuBarProps {
  editor: Editor | null;
}

type BlockItem = {
  label: string;
  title: string;
  command: string;
  args?: unknown[];
};

const BLOCK_ITEMS: BlockItem[] = [
  { label: "¶",  title: "Paragraph",    command: "setParagraph" },
  { label: "H1", title: "Heading 1",    command: "setHeading1" },
  { label: "H2", title: "Heading 2",    command: "setHeading2" },
  { label: "H3", title: "Heading 3",    command: "setHeading3" },
  { label: "•",  title: "Bullet List",  command: "toggleBulletList" },
  { label: "1.", title: "Ordered List", command: "toggleOrderedList" },
  { label: "<>", title: "Code Block",   command: "toggleCodeBlock" },
  { label: "—",  title: "Divider",      command: "insertHorizontalRule" },
];

export function FloatingMenuBar({ editor }: FloatingMenuBarProps) {
  const [open, setOpen] = useState(false);

  function runCommand(item: BlockItem) {
    setOpen(false);
    editor?.commands[item.command]?.(...(item.args ?? []));
  }

  return (
    <FloatingMenu editor={editor}>
      <div style={styles.wrap}>
        <button
          title="Insert block"
          onMouseDown={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
          style={{ ...styles.plusBtn, ...(open ? styles.plusBtnOpen : {}) }}
        >
          +
        </button>

        {open && (
          <div style={styles.dropdown}>
            {BLOCK_ITEMS.map((item) => (
              <button
                key={item.command}
                title={item.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  runCommand(item);
                }}
                style={styles.dropItem}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <span style={styles.dropIcon}>{item.label}</span>
                <span style={styles.dropLabel}>{item.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </FloatingMenu>
  );
}

const styles = {
  wrap: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
  },
  plusBtn: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1.5px solid #94a3b8",
    background: "#fff",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
    padding: 0,
  },
  plusBtnOpen: {
    background: "#3b82f6",
    borderColor: "#3b82f6",
    color: "#fff",
    transform: "rotate(45deg)",
  },
  dropdown: {
    position: "absolute" as const,
    left: 30,
    top: "50%",
    transform: "translateY(-50%)",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "4px",
    minWidth: 160,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    zIndex: 100,
  },
  dropItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "transparent",
    border: "none",
    borderRadius: 5,
    padding: "6px 8px",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  dropIcon: {
    width: 24,
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
    textAlign: "center" as const,
    flexShrink: 0,
  },
  dropLabel: {
    fontSize: 13,
    color: "#1e293b",
  },
} as const;
