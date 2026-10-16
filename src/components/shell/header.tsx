"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { CloudCheck, Moon, Sun, WifiOff } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/constants";
import { useRevisiones } from "@/components/screens/revisiones-provider";

function suscribirTema(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function temaActual() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function Header() {
  const { online, refreshing, error } = useRevisiones();
  const tema = useSyncExternalStore(suscribirTema, temaActual, () => null);
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="app-brand">
          <span className="brand-mark">
            <Image src="/icons/icon-192.png" alt="" width={44} height={44} priority />
          </span>
          <div>
            <p className="brand-name">{APP_SHORT_NAME}</p>
            {tema && (
              <p className="brand-caption theme-mode" aria-live="polite">
                {tema === "dark" ? <Moon size={11} aria-hidden="true" /> : <Sun size={11} aria-hidden="true" />}
                {tema === "dark" ? "Modo noche" : "Modo día"}
              </p>
            )}
          </div>
        </div>
        <div
          className={`connection-button ${!online ? "is-offline" : ""}`}
        >
          <span className="connection-dot" />
          <span aria-live="polite">
            {!online
              ? "Sin conexión"
              : refreshing
                ? "Actualizando"
                : error
                  ? "Sin actualizar"
                  : "En línea"}
          </span>
          {online ? (
            <CloudCheck size={17} aria-hidden="true" />
          ) : (
            <WifiOff size={17} aria-hidden="true" />
          )}
        </div>
      </div>
    </header>
  );
}
