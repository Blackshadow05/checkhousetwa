"use client";

import {
  CloudCheck,
  CloudDownload,
  HardDrive,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useRevisiones } from "@/components/screens/revisiones-provider";

export function SyncScreen() {
  const {
    revisiones,
    online,
    savedAt,
    localAvailable,
    storageError,
    refreshing,
    error,
    refresh,
  } = useRevisiones();
  return (
    <section className="sync-screen">
      <div className="welcome-block">
        <p className="eyebrow">SIEMPRE A MANO</p>
        <h1>
          Tus datos<span>.</span>
        </h1>
        <p>Las revisiones te acompañan, incluso sin señal.</p>
      </div>
      <div className="sync-hero">
        <div className="sync-hero-icon">
          {online ? (
            <CloudCheck size={36} strokeWidth={1.4} />
          ) : (
            <WifiOff size={36} strokeWidth={1.4} />
          )}
        </div>
        <h2>
          {online
            ? error
              ? "Pendiente de actualizar"
              : "Estás en línea"
            : "Estás sin conexión"}
        </h2>
        <p>
          {online
            ? "Actualiza las revisiones para tener una copia reciente en este dispositivo."
            : "Puedes seguir consultando las revisiones disponibles. Al volver la conexión, intentaremos actualizarlas."}
        </p>
      </div>
      <div className="sync-details">
        <div>
          <Wifi size={19} />
          <span>Conexión</span>
          <strong>{online ? "Disponible" : "Sin señal"}</strong>
        </div>
        <div>
          <HardDrive size={19} />
          <span>Copia en el dispositivo</span>
          <strong>
            {storageError
              ? "No disponible"
              : localAvailable
                ? "Guardada"
                : "Sin copia"}
          </strong>
        </div>
        <div>
          <CloudDownload size={19} />
          <span>Revisiones disponibles</span>
          <strong>{revisiones.length}</strong>
        </div>
      </div>
      {savedAt && (
        <p className="sync-timestamp">
          Última copia:{" "}
          {new Intl.DateTimeFormat("es-CR", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(savedAt))}
        </p>
      )}
      <button
        type="button"
        className="primary-button sync-refresh"
        onClick={() => void refresh()}
        disabled={!online || refreshing}
      >
        <CloudDownload size={18} />
        {refreshing ? "Actualizando revisiones…" : "Actualizar revisiones"}
      </button>
      <p role="status" className="sync-feedback">
        {error && online
          ? "No pudimos actualizar. Tus datos disponibles se conservan."
          : refreshing
            ? "Puedes seguir usando la app mientras actualizamos."
            : localAvailable
              ? "Tu última copia está disponible sin conexión."
              : "Actualiza para guardar tus revisiones aquí."}
      </p>
    </section>
  );
}
