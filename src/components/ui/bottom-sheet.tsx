"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { preserveKeyboardFocus } from "@/lib/keyboard-focus";

const EXIT_MS = 260;
// Swipe-to-close: drag distance (fraction of the sheet) or flick speed (px/ms).
const SWIPE_CLOSE_RATIO = 0.3;
const SWIPE_CLOSE_VELOCITY = 0.5;
const SWIPE_SLOP = 6;

export function BottomSheet({
  open,
  onClose,
  onExited,
  title,
  swipeToClose = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  title: string;
  /** Allow dragging the sheet down to close it, like a mobile notification shade. */
  swipeToClose?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const exited = useRef(onExited);
  const close = useRef(onClose);
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
    close.current = onClose;
  }, [onExited, onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!swipeToClose || !active || !element) return;
    const body = element.querySelector<HTMLElement>(".sheet-body");
    let state: "idle" | "pending" | "dragging" = "idle";
    let target: Element | null = null;
    let startX = 0;
    let startY = 0;
    let offset = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    const setOffset = (value: number) => {
      offset = value;
      element.style.transform = value ? `translateY(${value}px)` : "";
      element.style.setProperty("--sheet-drag-offset", `${value}px`);
      element.style.setProperty("--sheet-drag-progress", String(Math.min(1, value / (element.offsetHeight || 1))));
    };
    const snapBack = () => {
      element.removeAttribute("data-dragging");
      element.style.transition = "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)";
      setOffset(0);
      element.style.removeProperty("--sheet-drag-progress");
      const done = () => {
        element.style.transition = "";
        element.removeEventListener("transitionend", done);
      };
      element.addEventListener("transitionend", done);
    };
    const onStart = (event: TouchEvent) => {
      state = "idle";
      if (event.touches.length !== 1 || element.hasAttribute("data-closing")) return;
      target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      lastTime = event.timeStamp;
      velocity = 0;
      state = "pending";
    };
    const onMove = (event: TouchEvent) => {
      if (state === "idle") return;
      const touch = event.touches[0];
      if (!touch) return;
      if (state === "pending") {
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return;
        // Leave upward drags, horizontal swipes and scrolled content to the browser.
        const scrolled = !!body && !!target && body.contains(target) && body.scrollTop > 0;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scrolled) {
          state = "idle";
          return;
        }
        state = "dragging";
        startY = touch.clientY;
        element.style.transition = "none";
        element.setAttribute("data-dragging", "");
      }
      event.preventDefault();
      const elapsed = event.timeStamp - lastTime;
      if (elapsed > 0) velocity = (touch.clientY - lastY) / elapsed;
      lastY = touch.clientY;
      lastTime = event.timeStamp;
      setOffset(Math.max(0, touch.clientY - startY));
    };
    const onEnd = () => {
      if (state !== "dragging") {
        state = "idle";
        return;
      }
      state = "idle";
      const shouldClose =
        offset > element.offsetHeight * SWIPE_CLOSE_RATIO ||
        (velocity > SWIPE_CLOSE_VELOCITY && offset > SWIPE_SLOP * 2);
      if (!shouldClose) {
        snapBack();
        return;
      }
      element.style.transition = "";
      // Keep data-dragging so the backdrop fades from its current opacity; the
      // exit animation starts from --sheet-drag-offset, continuing the gesture.
      close.current();
    };
    const onCancel = () => {
      if (state === "dragging") snapBack();
      state = "idle";
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onCancel);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onCancel);
      element.removeAttribute("data-dragging");
      element.style.transform = "";
      element.style.transition = "";
      element.style.removeProperty("--sheet-drag-offset");
      element.style.removeProperty("--sheet-drag-progress");
    };
  }, [active, swipeToClose]);

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
          event.clientY > bounds.bottom ||
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
