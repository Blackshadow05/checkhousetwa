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
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [content, setContent] = useState<ReactNode>(open ? children : null);

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
    if (!open || !element || !viewport) return;
    let frame = 0;
    let revealTimer = 0;
    let height = 0;
    let offset = -1;
    const revealField = () => {
      window.clearTimeout(revealTimer);
      // Let native keyboard panning finish before correcting a clipped field.
      revealTimer = window.setTimeout(() => {
        if (viewport.scale !== 1) return;
        const focused = document.activeElement;
        const body = element.querySelector<HTMLElement>(".sheet-body");
        if (!body || !(focused instanceof HTMLElement) || !body.contains(focused) || !focused.matches("input, textarea, select")) return;
        const fieldBounds = focused.getBoundingClientRect();
        const bodyBounds = body.getBoundingClientRect();
        const top = Math.max(bodyBounds.top, viewport.offsetTop) + 12;
        const bottom = Math.min(bodyBounds.bottom, viewport.offsetTop + viewport.height) - 12;
        const delta = fieldBounds.bottom > bottom ? fieldBounds.bottom - bottom
          : fieldBounds.top < top ? fieldBounds.top - top : 0;
        if (delta) body.scrollTop += delta;
      }, 150);
    };
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Pinch zoom must remain under the user's control.
        if (viewport.scale !== 1) return;
        const nextHeight = Math.round(viewport.height);
        const nextOffset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
        if (height !== nextHeight) {
          height = nextHeight;
          element.style.setProperty("--sheet-viewport-height", `${height}px`);
        }
        if (offset !== nextOffset) {
          offset = nextOffset;
          element.style.setProperty("--sheet-keyboard-offset", `${offset}px`);
        }
      });
    };
    const resize = () => { update(); revealField(); };
    update();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", update);
    element.addEventListener("focusin", revealField);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(revealTimer);
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", update);
      element.removeEventListener("focusin", revealField);
      element.style.removeProperty("--sheet-viewport-height");
      element.style.removeProperty("--sheet-keyboard-offset");
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="bottom-sheet"
      data-closing={closing || undefined}
      aria-label={title}
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
        )
          onClose();
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
