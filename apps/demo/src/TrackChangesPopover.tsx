import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import type { Editor } from "@inscribe/core";
import { createChangePopover, CHANGE_OPERATION, CHANGE_STATUS } from "@inscribe/plugins";
import type { ChangePopoverInfo } from "@inscribe/plugins";

interface TrackChangesPopoverProps {
  editor: Editor | null;
}

const OPERATION_LABEL: Partial<Record<CHANGE_OPERATION, string>> = {
  [CHANGE_OPERATION.insert]:           "Insertion",
  [CHANGE_OPERATION.delete]:           "Deletion",
  [CHANGE_OPERATION.move]:             "Move",
  [CHANGE_OPERATION.wrap_with_node]:   "Wrap",
  [CHANGE_OPERATION.set_node_attributes]: "Attribute change",
};

export function TrackChangesPopover({ editor }: TrackChangesPopoverProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [info, setInfo] = useState<ChangePopoverInfo | null>(null);
  const [pos,  setPos]  = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    return createChangePopover(editor, {
      onShow: (r, i) => { setRect(r); setInfo(i); },
      onMove: (r, i) => { setRect(r); setInfo(i); },
      onHide: ()     => { setRect(null); setInfo(null); setPos(null); },
    });
  }, [editor]);

  useEffect(() => {
    if (!rect || !menuRef.current) return;
    const virtualEl = {
      getBoundingClientRect: () => rect,
      getClientRects:        () => [rect] as unknown as DOMRectList,
    };
    computePosition(virtualEl, menuRef.current, {
      placement: "bottom-start",
      middleware: [offset(8), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => setPos({ x, y }));
  }, [rect]);

  if (!rect || !info) return null;

  const label = OPERATION_LABEL[info.operation] ?? info.operation;
  const author = info.authorID.split(":").pop() ?? info.authorID;

  function handleAccept() {
    editor?.commands.setChangeStatuses?.(CHANGE_STATUS.accepted, [info!.id]);
    setRect(null);
  }

  function handleReject() {
    editor?.commands.setChangeStatuses?.(CHANGE_STATUS.rejected, [info!.id]);
    setRect(null);
  }

  return createPortal(
    <div
      ref={menuRef}
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position:     "fixed",
        left:         pos?.x ?? 0,
        top:          pos?.y ?? 0,
        zIndex:       60,
        visibility:   pos ? "visible" : "hidden",
        background:   "#fff",
        border:       "1px solid #e2e8f0",
        borderRadius: 8,
        boxShadow:    "0 4px 16px rgba(0,0,0,0.12)",
        padding:      "8px 10px",
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        fontSize:     13,
        whiteSpace:   "nowrap",
        minWidth:     220,
      }}
    >
      {/* Operation badge */}
      <span style={{
        ...badge,
        background: info.operation === CHANGE_OPERATION.delete ? "#fee2e2" : "#dcfce7",
        color:      info.operation === CHANGE_OPERATION.delete ? "#b91c1c" : "#15803d",
      }}>
        {info.operation === CHANGE_OPERATION.delete ? "−" : "+"} {label}
      </span>

      {/* Author */}
      <span style={{ color: "#64748b", fontSize: 12, flex: 1 }}>
        {author}
      </span>

      {/* Actions */}
      <button onClick={handleAccept} style={btnStyle("#15803d", "#fff")} title="Accept change">
        ✓ Accept
      </button>
      <button onClick={handleReject} style={btnStyle("#b91c1c", "#fff")} title="Reject change">
        ✗ Reject
      </button>
    </div>,
    document.body,
  );
}

const badge = {
  display:      "inline-flex",
  alignItems:   "center",
  gap:          3,
  padding:      "2px 7px",
  borderRadius: 99,
  fontSize:     11,
  fontWeight:   600,
} as const;

function btnStyle(bg: string, color: string) {
  return {
    background:   bg,
    color,
    border:       "none",
    borderRadius: 4,
    padding:      "3px 9px",
    cursor:       "pointer",
    fontSize:     12,
    fontWeight:   600,
  } as const;
}
