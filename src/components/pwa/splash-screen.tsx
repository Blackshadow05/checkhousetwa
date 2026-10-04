"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SPLASH_BOOT_SCRIPT } from "@/lib/splash-screen";

const HOLD_MS: Record<string, number> = { android: 650, compact: 420 };
const MAX_WAIT_MS = 3200;
const FLIGHT_MS = 720;
const FADE_MS = 280;
const FLIGHT_EASING = "cubic-bezier(0.55, 0, 0.15, 1)";

const subscribe = () => () => {};
const splashMode = () => document.documentElement.dataset.splash;
const isActive = () => splashMode() !== undefined;
const isActiveOnServer = () => true;

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

function isVisible(element: Element) {
  return element.getClientRects().length > 0;
}

function appReady() {
  return (
    !document.querySelector(".installed-gate") &&
    Array.from(document.querySelectorAll(".app-shell-frame")).some(isVisible)
  );
}

function headerMark() {
  return Array.from(document.querySelectorAll(".app-header .brand-mark")).find(isVisible) ?? null;
}

function firstPaintAt() {
  return performance.getEntriesByType("paint")[0]?.startTime ?? 0;
}

async function leave(overlay: HTMLElement) {
  if (typeof overlay.animate !== "function") return;
  const mark = overlay.querySelector<HTMLElement>(".app-splash-mark");
  const backdrop = overlay.querySelector<HTMLElement>(".app-splash-backdrop");
  const progress = overlay.querySelector<HTMLElement>(".app-splash-progress");
  const target = headerMark();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !target || !mark || !backdrop) {
    await overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      easing: "ease",
      fill: "forwards",
    }).finished;
    return;
  }
  const from = mark.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = to.width / mark.offsetWidth;
  const start = getComputedStyle(mark).transform;
  progress?.animate([{ opacity: getComputedStyle(progress).opacity }, { opacity: 0 }], {
    duration: 150,
    fill: "forwards",
  });
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FLIGHT_MS - 220,
    delay: 200,
    easing: "ease-out",
    fill: "forwards",
  });
  await mark.animate(
    [
      { transform: start === "none" ? "translate(0, 0) scale(1)" : start },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    ],
    { duration: FLIGHT_MS, easing: FLIGHT_EASING, fill: "forwards" },
  ).finished;
}

export function SplashScreen() {
  const active = useSyncExternalStore(subscribe, isActive, isActiveOnServer);
  const [done, setDone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mode = splashMode();
    const overlay = overlayRef.current;
    if (!mode || !overlay) return;
    let cancelled = false;
    let observer: MutationObserver | undefined;
    const ready = new Promise<void>((resolve) => {
      if (appReady()) {
        resolve();
        return;
      }
      observer = new MutationObserver(() => {
        if (!appReady()) return;
        observer?.disconnect();
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const hold = wait(firstPaintAt() + (HOLD_MS[mode] ?? HOLD_MS.compact) - performance.now());
    void Promise.race([Promise.all([ready, hold]), wait(MAX_WAIT_MS)])
      .then(() => (cancelled ? undefined : leave(overlay)))
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        delete document.documentElement.dataset.splash;
        setDone(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }}
      />
      {active && !done && (
        <div ref={overlayRef} className="app-splash" aria-hidden="true">
          <div className="app-splash-backdrop" />
          <div className="app-splash-mark" />
          <div className="app-splash-progress" />
        </div>
      )}
    </>
  );
}
