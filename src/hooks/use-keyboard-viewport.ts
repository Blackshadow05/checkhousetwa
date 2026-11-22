"use client";

import { useEffect } from "react";

const EDITABLE_SELECTOR =
  "input:not([type='hidden']):not([type='radio']):not([type='checkbox']):not([type='file']):not([type='button']):not([type='submit']):not([type='reset']), textarea, select, [contenteditable='true']";
const SCROLL_CONTAINER_SELECTOR = ".revision-form-scroll, .app-screen";
const MIN_KEYBOARD_HEIGHT = 110;

export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;
    let pendingReveal = false;
    let lastInset = -1;
    let lastOpen = false;
    let lastFocused: HTMLElement | null = null;

    const clear = () => {
      if (lastInset !== 0) {
        lastInset = 0;
        root.style.removeProperty("--keyboard-inset");
      }
      if (lastOpen) {
        lastOpen = false;
        delete root.dataset.keyboardOpen;
      }
    };

    const revealFocused = (focused: HTMLElement, container: HTMLElement) => {
      const containerBounds = container.getBoundingClientRect();
      const top = Math.max(containerBounds.top, viewport.offsetTop) + 12;
      const bottom = Math.min(containerBounds.bottom, viewport.offsetTop + viewport.height) - 16;
      if (bottom <= top) return;
      const field = focused.closest<HTMLElement>(".revision-text-field, label") ?? focused;
      const fieldBounds = field.getBoundingClientRect();
      const bounds = fieldBounds.height <= bottom - top ? fieldBounds : focused.getBoundingClientRect();
      const delta =
        bounds.bottom > bottom ? bounds.bottom - bottom
        : bounds.top < top ? bounds.top - top
        : 0;
      if (Math.abs(delta) > 1) {
        container.scrollTop += delta;
      }
    };

    const update = (shouldReveal = false) => {
      if (shouldReveal) pendingReveal = true;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const revealRequested = pendingReveal;
        pendingReveal = false;
        if (viewport.scale !== 1) return;

        const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const insideDialog = Boolean(focused?.closest("dialog"));
        const isEditing = Boolean(focused && !insideDialog && focused.matches(EDITABLE_SELECTOR));

        if (!isEditing || !focused) {
          lastFocused = null;
          clear();
          return;
        }

        const keyboardHeight = Math.max(0, Math.round(window.innerHeight - viewport.height));
        if (keyboardHeight < MIN_KEYBOARD_HEIGHT) {
          lastFocused = focused;
          clear();
          return;
        }

        const nav = document.querySelector<HTMLElement>(".bottom-navigation");
        const navHeight = nav && nav.offsetParent !== null ? nav.offsetHeight : 0;
        const inset = Math.max(0, keyboardHeight - navHeight) + 16;

        const insetChanged = inset !== lastInset;
        if (insetChanged) {
          lastInset = inset;
          root.style.setProperty("--keyboard-inset", `${inset}px`);
        }
        if (!lastOpen) {
          lastOpen = true;
          root.dataset.keyboardOpen = "";
        }

        const focusChanged = focused !== lastFocused;
        lastFocused = focused;
        if (revealRequested || insetChanged || focusChanged) {
          const container = focused.closest<HTMLElement>(SCROLL_CONTAINER_SELECTOR);
          if (container) revealFocused(focused, container);
        }
      });
    };

    const onViewportChange = () => update(false);
    const onFocusIn = () => update(true);
    const onFocusOut = () => update(false);

    viewport.addEventListener("resize", onViewportChange);
    viewport.addEventListener("scroll", onViewportChange);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", onViewportChange);
      viewport.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--keyboard-inset");
      delete root.dataset.keyboardOpen;
    };
  }, []);
}
