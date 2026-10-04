"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { APP_SHORT_NAME, APP_TAGLINE } from "@/lib/constants";
import { SPLASH_BOOT_SCRIPT } from "@/lib/splash-screen";

const HOLD_MS = 240;
const MAX_WAIT_MS = 3200;
const EXIT_MS = 360;
const INTRO_FALLBACK_MS = 1000;

type Phase = "intro" | "leaving" | "gone";

const subscribe = () => () => {};
const isActive = () => document.documentElement.dataset.splash !== undefined;
const isActiveOnServer = () => true;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function appVisible() {
  return Array.from(document.querySelectorAll(".app-shell-frame")).some(
    (frame) => frame.getClientRects().length > 0,
  );
}

async function introFinished(brand: HTMLElement | null) {
  if (!brand || typeof brand.getAnimations !== "function") return wait(INTRO_FALLBACK_MS);
  const finite = brand
    .getAnimations({ subtree: true })
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
  await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
}

export function SplashScreen() {
  const active = useSyncExternalStore(subscribe, isActive, isActiveOnServer);
  const [phase, setPhase] = useState<Phase>("intro");
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive()) return;
    let cancelled = false;
    let observer: MutationObserver | undefined;
    const ready = new Promise<void>((resolve) => {
      if (appVisible()) {
        resolve();
        return;
      }
      observer = new MutationObserver(() => {
        if (!appVisible()) return;
        observer?.disconnect();
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    void Promise.race([
      Promise.all([introFinished(brandRef.current), ready]).then(() => wait(HOLD_MS)),
      wait(MAX_WAIT_MS),
    ]).then(() => {
      if (!cancelled) setPhase("leaving");
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => {
      delete document.documentElement.dataset.splash;
      setPhase("gone");
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }}
      />
      {active && phase !== "gone" && (
        <div className={`app-splash${phase === "leaving" ? " is-leaving" : ""}`} aria-hidden="true">
          <div ref={brandRef} className="app-splash-brand">
            <Image
              className="app-splash-mark"
              src="/splash/marca.webp"
              alt=""
              width={120}
              height={120}
              unoptimized
              loading="eager"
              fetchPriority="high"
              decoding="sync"
            />
            <div className="app-splash-name">
              <p className="app-splash-title">{APP_SHORT_NAME}</p>
              <p className="app-splash-tagline">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="app-splash-progress" />
        </div>
      )}
    </>
  );
}
