"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { preserveKeyboardFocus } from "@/lib/keyboard-focus";

const EXIT_MS = 260;

export function BottomSheet({
  open,
  onClose,
  onExited,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const exited = useRef(onExited);
  const editingOnPointerDown = useRef(false);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [content, setContent] = useState<ReactNode>(open ? children : null);
  const active = open || closing;

  if (wasOpen !== open) {
    setWasOpen(open);
    setClosing(!open);
  }
  if (open && content !== children) setContent(children);

  useEffect(() => {
    exited.current = onExited;
  }, [onExited]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) element.showModal();
      return;
    }
    if (!closing) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
    const animate = element.open && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      if (element.open) element.close();
      setClosing(false);
      setContent(null);
      exited.current?.();
    }, animate ? EXIT_MS : 0);
    return () => window.clearTimeout(timer);
  }, [open, closing]);

  useEffect(() => {
    const element = dialog.current;
    const viewport = window.visualViewport;
    if (!active || !element) return;
    const body = element.querySelector<HTMLElement>(".sheet-body");
    if (!body) return;
    let frame = 0;
    let height = 0;
    let offset = -1;
    const revealField = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !body.contains(focused) || !focused.matches("input, textarea, select, [contenteditable='true']")) return;
      const bodyBounds = body.getBoundingClientRect();
      const top = Math.max(bodyBounds.top, viewport?.offsetTop ?? 0) + 12;
      const bottom = Math.min(bodyBounds.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - 12;
      if (bottom <= top) return;
      // Include the label when it fits, and move only the sheet's scroll area.
      const field = focused.closest(".revision-text-field") ?? focused;
      const fieldBounds = field.getBoundingClientRect();
      const bounds = fieldBounds.height <= bottom - top ? fieldBounds : focused.getBoundingClientRect();
      const delta = bounds.bottom > bottom ? bounds.bottom - bottom
        : bounds.top < top ? bounds.top - top : 0;
      if (Math.abs(delta) > 1) body.scrollTop += delta;
    };
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Pinch zoom must remain under the user's control.
        if (viewport && viewport.scale !== 1) return;
        const nextHeight = Math.round(viewport?.height ?? window.innerHeight);
        const nextOffset = Math.max(0, Math.round(window.innerHeight - nextHeight - (viewport?.offsetTop ?? 0)));
        if (height !== nextHeight) {
          height = nextHeight;
          element.style.setProperty("--sheet-viewport-height", `${height}px`);
        }
        if (offset !== nextOffset) {
          offset = nextOffset;
          element.style.setProperty("--sheet-keyboard-offset", `${offset}px`);
        }
        // Follow the native viewport in the same frame; a delayed correction
        // after the keyboard animation produces a second, abrupt scroll.
        revealField();
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(body);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    element.addEventListener("focusin", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      element.removeEventListener("focusin", update);
      element.style.removeProperty("--sheet-viewport-height");
      element.style.removeProperty("--sheet-keyboard-offset");
    };
  }, [active]);

  return (
    <dialog
      ref={dialog}
      className="bottom-sheet"
      data-closing={closing || undefined}
      aria-label={title}
      onPointerDownCapture={() => {
        const focused = document.activeElement;
        editingOnPointerDown.current = focused instanceof HTMLElement && !!dialog.current?.contains(focused) && focused.matches("input, textarea, select, [contenteditable='true']");
      }}
      onMouseDown={preserveKeyboardFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientY < bounds.top ||
          event.clientX < bounds.left ||
          event.clientX > bounds.right
        ) {
          const focused = document.activeElement;
          if (editingOnPointerDown.current) {
            editingOnPointerDown.current = false;
            if (focused instanceof HTMLElement && event.currentTarget.contains(focused)) focused.blur();
            return;
          }
          onClose();
        }
      }}
    >
      <div className="sheet-handle" aria-hidden="true" />
      <div className="sheet-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar panel"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="sheet-body">{open ? children : content}</div>
    </dialog>
  );
}
