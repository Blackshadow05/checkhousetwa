"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const INSTALLED_QUERY = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)";

type GateState = "pending" | "installed" | "browser";

let oauthReturnAllowed = false;

function isOAuthReturn() {
  if (oauthReturnAllowed) return true;
  const pathname = window.location.pathname;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    oauthReturnAllowed = true;
    return true;
  }
  const auth = new URLSearchParams(window.location.search).get("auth");
  if (auth === "authenticator" || auth === "unauthorized" || auth === "error") {
    oauthReturnAllowed = true;
    return true;
  }
  return false;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(INSTALLED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getState(): GateState {
  if (isOAuthReturn()) return "installed";
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia(INSTALLED_QUERY).matches ? "installed" : "browser";
}

function getServerState(): GateState {
  return "pending";
}

function isIos() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function InstalledGate({ restrict, children }: { restrict: boolean; children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getState, getServerState);
  // Vercel Preview Deployments skip the install gate so reviewers can open links directly in a browser.
  if (!restrict || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") return children;
  return (
    <>
      <div className="installed-gate-app" inert={state !== "installed"} aria-hidden={state !== "installed"}>
        {children}
      </div>
      {state !== "installed" && (
        <div className="installed-gate" role={state === "browser" ? "alert" : undefined}>
          {state === "browser" && (
            <div className="installed-gate-card">
              <img src="/icons/icon-192.png" alt="" width={88} height={88} />
              <h1>Abre Casitas desde la app</h1>
              {isIos() ? (
                <p>En Safari toca Compartir y luego “Agregar a pantalla de inicio”. Después abre Casitas desde el ícono.</p>
              ) : (
                <p>Abre la app Casitas instalada en tu teléfono. Si aún no la tienes, pide el instalador al administrador.</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
