"use client";

import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { InstalledGate } from "@/components/pwa/installed-gate";

function UpdateNotice() {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const applying = useRef(false);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    const onControlling = () => {
      // A document reload is only requested explicitly to activate a new version.
      if (applying.current) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    let mounted = true;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (mounted && registration?.waiting) setWaiting(true);
      })
      .catch(() => {
        /* Update checks must never interrupt the current screen. */
      });
    return () => {
      mounted = false;
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  useEffect(() => {
    if (!dismissed) return;
    const remind = () => { if (document.visibilityState === "visible") setDismissed(false); };
    const timer = window.setTimeout(() => setDismissed(false), 10 * 60_000);
    document.addEventListener("visibilitychange", remind);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", remind);
    };
  }, [dismissed]);

  if (!waiting || dismissed) return null;
  return (
    <aside className="update-toast" role="status" aria-label="Actualización disponible">
      <span className="update-toast-icon" aria-hidden="true">
        <RefreshCw size={20} />
      </span>
      <span className="update-toast-copy">
        <strong>Nueva versión disponible</strong>
        <small>Trae mejoras para la app.</small>
      </span>
      <button
        className="update-toast-action"
        type="button"
        onClick={() => {
          applying.current = true;
          serwist?.messageSkipWaiting();
        }}
      >
        Actualizar
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Actualizar más tarde"
        onClick={() => setDismissed(true)}
      >
        <X size={18} />
      </button>
    </aside>
  );
}

export function PwaProvider({ restrict, children }: { restrict: boolean; children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === "development"}
      reloadOnOnline={false}
    >
      <InstalledGate restrict={restrict}>
        {children}
        <UpdateNotice />
      </InstalledGate>
    </SerwistProvider>
  );
}
