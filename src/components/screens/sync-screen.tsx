"use client";

import {
  CircleAlert,
  CloudCheck,
  CloudDownload,
  CloudUpload,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { fechaHora } from "@/lib/fechas";

export function SyncScreen() {
  const {
    revisiones,
    pendientes,
    online,
    savedAt,
    localAvailable,
    storageError,
    refreshing,
    error,
    refresh,
    reintentarRevision,
  } = useRevisiones();

  const pendingIds = new Set(pendientes.map((item) => item.draft.id));
  const syncedCount = revisiones.filter((row) => !pendingIds.has(row.id)).length;
  const savingCount = pendientes.filter((item) => item.status === "saving").length;
  const waitingCount = pendientes.filter((item) => item.status === "waiting").length;
  const errorCount = pendientes.filter((item) => item.status === "error").length;
  const retryable = pendientes.filter((item) => item.status === "waiting" || item.status === "error");

  const retryPending = () => {
    if (!online) return;
    for (const item of retryable) {
      reintentarRevision(item.draft.id);
    }
  };

  const handleRefresh = () => {
    retryPending();
    void refresh();
  };

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
            errorCount > 0 ? (
              <CircleAlert size={36} strokeWidth={1.4} />
            ) : (
              <CloudCheck size={36} strokeWidth={1.4} />
            )
          ) : (
            <WifiOff size={36} strokeWidth={1.4} />
          )}
        </div>
        <h2>
          {online
            ? errorCount > 0
              ? "Hay envíos sin confirmar"
              : error
                ? "Pendiente de actualizar"
                : "Estás en línea"
            : "Estás sin conexión"}
        </h2>
        <p>
          {online
            ? errorCount > 0
              ? "Reintenta los envíos pendientes o actualiza para mantener tus revisiones al día."
              : "Actualiza las revisiones para tener una copia reciente en este dispositivo."
            : "Puedes seguir consultando las revisiones disponibles. Al volver la conexión, intentaremos actualizarlas."}
        </p>
      </div>
      {pendientes.length > 0 && (
        <div className="detail-card" style={{ marginTop: 16 }} role="region" aria-label="Envíos pendientes">
          <div className="detail-card-heading">
            <CloudUpload size={19} aria-hidden="true" />
            <h2>Envíos pendientes</h2>
            <span className="detail-card-count">{pendientes.length}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {errorCount > 0 && (
              <span className="status-badge tone-rose">
                <CircleAlert size={13} aria-hidden="true" />
                {errorCount === 1 ? "1 con error" : `${errorCount} con error`}
              </span>
            )}
            {waitingCount > 0 && (
              <span className="status-badge tone-amber">
                <WifiOff size={13} aria-hidden="true" />
                {waitingCount === 1 ? "1 esperando red" : `${waitingCount} esperando red`}
              </span>
            )}
            {savingCount > 0 && (
              <span className="status-badge tone-blue">
                <LoaderCircle size={13} className="revision-spinner" aria-hidden="true" />
                {savingCount === 1 ? "1 enviándose…" : `${savingCount} enviándose…`}
              </span>
            )}
          </div>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", lineHeight: 1.55 }}>
            {!online
              ? "Estas revisiones están guardadas en este dispositivo y se enviarán al volver la conexión."
              : errorCount > 0
                ? "No pudimos confirmar el envío de algunas revisiones. Conservamos los datos para reintentar."
                : waitingCount > 0
                  ? "Tienes revisiones en espera de envío. Puedes reintentarlas ahora."
                  : "Enviando tus revisiones pendientes…"}
          </p>
          {retryable.length > 0 && (
            <button
              type="button"
              className="secondary-button sync-refresh"
              onClick={retryPending}
              disabled={!online}
            >
              <RefreshCw size={17} aria-hidden="true" />
              {retryable.length === 1 ? "Reintentar envío pendiente" : `Reintentar ${retryable.length} envíos`}
            </button>
          )}
        </div>
      )}
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
          <span>Revisiones sincronizadas</span>
          <strong>{syncedCount}</strong>
        </div>
        {pendientes.length > 0 && (
          <div>
            <CloudUpload size={19} />
            <span>Pendientes de envío</span>
            <strong>{pendientes.length}</strong>
          </div>
        )}
      </div>
      {savedAt && (
        <p className="sync-timestamp">
          Última copia:{" "}
          {fechaHora(savedAt)}
        </p>
      )}
      <button
        type="button"
        className="primary-button sync-refresh"
        onClick={handleRefresh}
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
            : pendientes.length > 0 && !online
              ? "Tus revisiones pendientes siguen guardadas en este dispositivo."
              : localAvailable
                ? "Tu última copia está disponible sin conexión."
                : "Actualiza para guardar tus revisiones aquí."}
      </p>
    </section>
  );
}
