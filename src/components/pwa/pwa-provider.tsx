"use client";

import { SerwistProvider, useSerwist } from "@serwist/next/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import { InstalledGate } from "@/components/pwa/installed-gate";
import { useOnline } from "@/lib/use-online";

let dismissedWaitingWorker: ServiceWorker | "unknown" | null = null;

function UpdateNotice() {
  const { serwist } = useSerwist();
  const online = useOnline();
  const [waiting, setWaiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const applying = useRef(false);
  const waitingWorker = useRef<ServiceWorker | "unknown" | null>(null);

  useEffect(() => {
    if (!serwist) return;
    const handleWaiting = (sw?: ServiceWorker | null) => {
      const id: ServiceWorker | "unknown" = sw ?? "unknown";
      waitingWorker.current = id;
      setWaiting(true);
      const alreadyDismissed = dismissedWaitingWorker === id;
      setDismissed(alreadyDismissed);
      if (!alreadyDismissed) setConfirming(false);
    };
    const onWaiting = (event: { sw?: ServiceWorker }) => {
      handleWaiting(event.sw);
    };
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
        if (mounted && registration?.waiting) handleWaiting(registration.waiting);
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

  const dismiss = () => {
    dismissedWaitingWorker = waitingWorker.current ?? "unknown";
    setConfirming(false);
    setDismissed(true);
  };

  const applyUpdate = () => {
    if (!navigator.onLine) return;
    if (!confirming && document.querySelector(".is-creating-revision")) {
      setConfirming(true);
      return;
    }
    applying.current = true;
    serwist?.messageSkipWaiting();
  };

  if (!waiting || dismissed) return null;
  return (
    <aside className="update-toast" role="status" aria-label="Actualización disponible">
      <span className="update-toast-icon" aria-hidden="true">
        <RefreshCw size={20} />
      </span>
      <span className="update-toast-copy">
        <strong>{confirming ? "Tienes una revisión abierta" : "Nueva versión disponible"}</strong>
        <small>
          {!online
            ? "Sin conexión. Conéctate para actualizar."
            : confirming
              ? "Actualizar recargará la app."
              : "Trae mejoras para la app."}
        </small>
      </span>
      <button
        className="update-toast-action"
        type="button"
        disabled={!online}
        onClick={applyUpdate}
      >
        {confirming ? "Recargar" : "Actualizar"}
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label={confirming ? "Cancelar actualización" : "Actualizar más tarde"}
        onClick={dismiss}
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
