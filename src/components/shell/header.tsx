"use client";

import Image from "next/image";
import { CloudCheck, WifiOff } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/constants";
import { useRevisiones } from "@/components/screens/revisiones-provider";

export function Header() {
  const { online, refreshing, error } = useRevisiones();
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="app-brand">
          <span className="brand-mark">
            <Image src="/icons/icon-192.png" alt="" width={44} height={44} priority />
          </span>
          <div>
            <p className="brand-name">{APP_SHORT_NAME}</p>
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
