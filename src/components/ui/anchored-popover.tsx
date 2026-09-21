"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A dropdown/popover anchored to a trigger button via `position: fixed` +
 * getBoundingClientRect, instead of `absolute` positioned relative to some
 * ancestor. Using `absolute` breaks the moment the trigger sits inside a
 * scrollable container (e.g. a table wrapped in `overflow-x-auto`) — the
 * ancestor's overflow clips the popover before it can render fully. `fixed`
 * positioning escapes that clipping regardless of DOM nesting, which is why
 * every "gear icon" / column-visibility / action-menu popover in this app
 * must use this instead of a bespoke `absolute` div.
 */
export function useAnchoredPopover<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; anchorTop: number } | null>(null);
  const anchorRef = useRef<T>(null);

  function toggle() {
    if (!open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, anchorTop: rect.top });
    }
    setOpen((o) => !o);
  }
  function close() {
    setOpen(false);
  }

  return { open, pos, anchorRef, toggle, close };
}

export function AnchoredPopover({
  pos,
  onClose,
  children,
  className = "w-52",
}: {
  pos: { top: number; left: number; anchorTop?: number };
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Initial guess anchors the panel's left edge to the trigger's left edge and
  // its top edge just below the trigger; both corrected below once the panel's
  // real size is known, so a wide/tall panel opened near an edge of the
  // viewport (e.g. a bottom action-bar button) never renders partially off-screen.
  const [left, setLeft] = useState(pos.left);
  const [top, setTop] = useState(pos.top);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let nextLeft = pos.left;
    if (rect.right > window.innerWidth - margin) {
      nextLeft -= rect.right - (window.innerWidth - margin);
    }
    if (nextLeft < margin) nextLeft = margin;

    let nextTop = pos.top;
    if (pos.top + rect.height > window.innerHeight - margin) {
      // Flip upward — anchor the panel's bottom edge just above the trigger
      // instead of its top edge just below, so bottom-bar triggers stay reachable.
      const anchorTop = pos.anchorTop ?? pos.top;
      nextTop = Math.max(margin, anchorTop - rect.height - 4);
    }
    // Clamping to the measured DOM rect is the whole point of this effect —
    // the corrected position can't be known before the panel has painted once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(nextLeft);
    setTop(nextTop);
  }, [pos.left, pos.top, pos.anchorTop]);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        style={{ top, left }}
        className={`fixed z-50 rounded-md border bg-popover p-3 text-left text-sm normal-case shadow-md ${className}`}
      >
        {children}
      </div>
    </>
  );
}
