"use client";

import { useLayoutEffect, useRef } from "react";

export function SegmentIndicator({ activeIndex }: { activeIndex: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const container = indicator?.parentElement;
    if (!indicator || !container) return;

    const place = (animate: boolean) => {
      const target = activeIndex >= 0
        ? container.querySelectorAll<HTMLElement>(":scope > button")[activeIndex]
        : undefined;
      if (!target) {
        indicator.dataset.hidden = "";
        return;
      }
      const box = target.getBoundingClientRect();
      if (!box.width) {
        placed.current = false;
        return;
      }
      const frame = container.getBoundingClientRect();
      const x = box.left - frame.left - container.clientLeft;
      const y = box.top - frame.top - container.clientTop;
      const instant = !animate || !placed.current;
      if (instant) indicator.style.transition = "none";
      delete indicator.dataset.hidden;
      indicator.style.width = `${box.width}px`;
      indicator.style.height = `${box.height}px`;
      indicator.style.transform = `translate(${x}px, ${y}px)`;
      if (instant) {
        void indicator.offsetWidth;
        indicator.style.transition = "";
      }
      placed.current = true;
    };

    place(true);
    let size = `${container.offsetWidth}x${container.offsetHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${container.offsetWidth}x${container.offsetHeight}`;
      if (next === size) return;
      size = next;
      place(false);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeIndex]);

  return <span ref={ref} className="segment-indicator" data-hidden="" aria-hidden="true" />;
}
