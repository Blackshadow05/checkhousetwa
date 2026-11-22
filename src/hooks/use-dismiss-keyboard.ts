"use client";

import { useEffect } from "react";

const CONTROL_SELECTOR = "input, textarea, select";
const FIELD_SELECTOR = `${CONTROL_SELECTOR}, [contenteditable]`;
const TAP_TOLERANCE = 10;

function isEditableField(element: HTMLElement) {
  // The browser resolves inherited, empty and plaintext-only contenteditable
  // values, including a nested contenteditable="false" boundary.
  return element.matches(CONTROL_SELECTOR) || element.isContentEditable;
}

function isTextEntryControl(element: HTMLElement) {
  return element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && /^(text|search|tel|url|email|password|number)$/.test(element.type));
}

export function useDismissKeyboard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let start: { id: number; x: number; y: number; editing: boolean; focused: HTMLElement | null } | null = null;
    let blockedActivation: HTMLElement | null = null;
    let blockedByUs = false;
    let preserveFocus = false;
    let frame = 0;
    const onDown = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      blockedActivation = null;
      blockedByUs = false;
      preserveFocus = false;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && isEditableField(focused);
      start = event.isPrimary && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, editing, focused: editing ? focused : null }
        : null;
    };
    const onMove = (event: PointerEvent) => {
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_TOLERANCE) start = null;
    };
    const onUp = (event: PointerEvent) => {
      const origin = start;
      start = null;
      if (!origin || origin.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_TOLERANCE) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (preserveFocus || target.closest("[data-preserve-keyboard]")) return;
      const field = target.closest(FIELD_SELECTOR);
      if (field instanceof HTMLElement && isEditableField(field)) {
        const bounds = field.getBoundingClientRect();
        const inside = origin.x >= bounds.left && origin.x <= bounds.right &&
          origin.y >= bounds.top && origin.y <= bounds.bottom;
        if (inside || !origin.editing) return;
        // Mobile hit testing can redirect a touch just outside the box to its
        // input. Use the original touch coordinates before mouse-event retargeting.
        blockedActivation = field;
      }
      const label = target.closest("label");
      if (!blockedActivation && origin.editing && label?.control instanceof HTMLElement && isTextEntryControl(label.control)) {
        if (label.control !== origin.focused && !label.control.matches(":disabled")) return;
        blockedActivation = label;
      }
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !isEditableField(focused)) return;
      // Deliver the tap's click before changing the keyboard and button geometry.
      // A different field may receive focus in the meantime; keep that focus.
      frame = requestAnimationFrame(() => {
        if (!preserveFocus && document.activeElement === focused) focused.blur();
      });
    };
    const preventActivation = (event: MouseEvent) => {
      if (blockedActivation && event.target instanceof Node && blockedActivation.contains(event.target)) {
        // Stop both mouse focus and label click forwarding from reopening the
        // keyboard. Pointer gestures and direct taps inside inputs remain native.
        blockedByUs = true;
        event.preventDefault();
      }
    };
    const onMouseDownBubble = (event: MouseEvent) => {
      if (
        event.defaultPrevented &&
        !blockedByUs &&
        event.target instanceof Element &&
        event.target.closest("button:not(:disabled)")
      ) {
        preserveFocus = true;
        cancelAnimationFrame(frame);
      }
    };
    const onClick = (event: MouseEvent) => {
      preventActivation(event);
      blockedActivation = null;
      blockedByUs = false;
    };
    const onCancel = () => {
      start = null;
      blockedActivation = null;
      blockedByUs = false;
      preserveFocus = false;
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onCancel, { passive: true });
    document.addEventListener("mousedown", preventActivation, true);
    window.addEventListener("mousedown", onMouseDownBubble);
    document.addEventListener("click", onClick, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("mousedown", preventActivation, true);
      window.removeEventListener("mousedown", onMouseDownBubble);
      document.removeEventListener("click", onClick, true);
    };
  }, [active]);
}
