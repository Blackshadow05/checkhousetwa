"use client";

import { CloudCheck, House, WifiOff } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/constants";
import { useAppNavigationContext } from "@/components/shell/navigation-context";
import { useRevisiones } from "@/components/screens/revisiones-provider";

export function Header() {
  const { navigate } = useAppNavigationContext();
  const { online, refreshing, error } = useRevisiones();
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="app-brand">
          <span className="brand-mark">
            <House size={23} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div>
            <p className="brand-name">{APP_SHORT_NAME}</p>
          </div>
        </div>
        <button
          type="button"
          className={`connection-button ${!online ? "is-offline" : ""}`}
          aria-label="Ver estado de conexión y datos"
          onClick={() => navigate("sync")}
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
        </button>
      </div>
    </header>
  );
}
