"use client";

import { useEffect } from "react";

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true']";

export function useDismissKeyboard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(`${FIELD_SELECTOR}, button, a, label, [role='button']`)) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) {
        focused.blur();
      }
    };
    // A drag on blank space should scroll without dismissing the keyboard.
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [active]);
}
