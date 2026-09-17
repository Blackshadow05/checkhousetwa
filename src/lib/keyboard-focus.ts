import type { MouseEvent } from "react";

// Keep the keyboard/layout stable until the button's click is delivered. Using
// mousedown also covers the compatibility mouse event emitted by a touch tap,
// without cancelling pointer/touch events used for scrolling and selection.
export function preserveKeyboardFocus(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const button = event.target.closest("button:not(:disabled)");
  const focused = document.activeElement;
  if (
    button && event.currentTarget.contains(button) &&
    focused instanceof HTMLElement && event.currentTarget.contains(focused) &&
    focused.matches("input, textarea, [contenteditable='true']")
  ) {
    event.preventDefault();
  }
}
