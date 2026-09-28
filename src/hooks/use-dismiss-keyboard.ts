"use client";

import { useEffect } from "react";

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";
const TAP_TOLERANCE = 10;

export function useDismissKeyboard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let start: { id: number; x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      start = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };
    const onUp = (event: PointerEvent) => {
      const origin = start;
      start = null;
      if (!origin || origin.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TAP_TOLERANCE) return;
      const target = event.target;
      const focused = document.activeElement;
      if (!(target instanceof Element) || !(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement)) return;
      if (target.closest(FIELD_SELECTOR)) return;
      if (target.closest("label")?.control === focused) return;
      focused.blur();
    };
    const onCancel = () => { start = null; };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
  }, [active]);
}
