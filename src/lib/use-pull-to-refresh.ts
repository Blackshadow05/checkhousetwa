"use client";

import { useEffect, useRef, type RefObject } from "react";

const THRESHOLD = 64;
const MAX_PULL = 104;
const REST = 68;
const MIN_SPIN_MS = 600;

export function usePullToRefresh(
  anchor: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  refreshing: boolean,
) {
  const handler = useRef(onRefresh);
  const active = useRef(refreshing);
  const settle = useRef<(() => void) | null>(null);

  useEffect(() => {
    handler.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    active.current = refreshing;
    if (!refreshing) settle.current?.();
  }, [refreshing]);

  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>(".app-screen");
    const mark = indicator.current;
    if (!root || !mark) return;
    let startX = 0;
    let startY = 0;
    let distance = 0;
    let tracking = false;
    let pulling = false;
    let busy = false;
    let live = true;

    const show = (value: number, state: "idle" | "pulling" | "ready" | "refreshing") => {
      distance = value;
      mark.style.setProperty("--pull", String(value));
      if (mark.dataset.state === "pulling" && state === "ready") navigator.vibrate?.(8);
      mark.dataset.state = state;
    };

    const onStart = (event: TouchEvent) => {
      pulling = false;
      tracking = !busy && event.touches.length === 1 && root.scrollTop <= 0 && navigator.onLine;
      if (!tracking) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= Math.abs(dx) || root.scrollTop > 0) {
          tracking = false;
          return;
        }
        pulling = true;
      }
      if (event.cancelable) event.preventDefault();
      const value = Math.min(MAX_PULL, Math.max(0, dy - 8) * 0.5);
      show(value, value >= THRESHOLD ? "ready" : "pulling");
    };

    const onEnd = () => {
      tracking = false;
      if (!pulling) return;
      pulling = false;
      if (distance < THRESHOLD) {
        show(0, "idle");
        return;
      }
      busy = true;
      show(REST, "refreshing");
      const started = performance.now();
      void handler.current().finally(() => {
        window.setTimeout(() => {
          const done = () => {
            settle.current = null;
            busy = false;
            if (live) show(0, "idle");
          };
          if (active.current) settle.current = done;
          else done();
        }, Math.max(0, MIN_SPIN_MS - (performance.now() - started)));
      });
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    return () => {
      live = false;
      settle.current = null;
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [anchor, indicator]);
}
