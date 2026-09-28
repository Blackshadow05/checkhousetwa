"use client";

import { useRef, type ReactNode } from "react";
import { Camera, CircleCheck, Images, LoaderCircle, RefreshCw, ScanSearch, TriangleAlert } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { RevisionPhotoPreview } from "@/components/screens/revision-photo-preview";
import { statusAppearance } from "@/lib/revisiones-display";
import { compararInventario, textoCantidad, type ComparacionArticulo, type InventarioCasita, type InventarioKey } from "@/lib/inventario-casitas";
import type { InventarioStatus } from "@/hooks/use-inventario-casitas";
import type { RevisionFormValues, RevisionPhoto, RevisionScan } from "@/lib/revision-form";
import styles from "./revision-recognition.module.css";

export { styles as recognitionStyles };

function photoLabel(index: number) {
  return `Foto ${String(index + 1).padStart(2, "0")}`;
}

function cantidadFotos(count: number) {
  return count === 1 ? "1 foto" : `${count} fotos`;
}

export function RecognitionPhotoSheet({ open, onClose, photos, limit, cajaFuerte, preparing, error, onPick, onRemove, onScan }: {
  open: boolean;
  onClose: () => void;
  photos: RevisionPhoto[];
  limit: number;
  cajaFuerte: string;
  preparing: boolean;
  error: string;
  onPick: (files: FileList | null) => void;
  onRemove: (photoId: string) => void;
  onScan: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const full = photos.length >= limit;
  return (
    <BottomSheet open={open} onClose={onClose} title="Fotos para escanear">
      <div className={styles.recognition}>
        <p className="sheet-description">
          Con {statusAppearance(cajaFuerte).label} puedes usar hasta {cantidadFotos(limit)}. Se comprimen antes de escanear y quedan como evidencia.
        </p>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { onPick(event.target.files); event.target.value = ""; }} />
        <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={limit - photos.length > 1} hidden onChange={(event) => { onPick(event.target.files); event.target.value = ""; }} />
        <div className={styles.sources}>
          <button type="button" disabled={full || preparing} onClick={() => cameraRef.current?.click()}>
            <Camera aria-hidden="true" />
            <strong>Cámara</strong>
            <small>Tomar una foto ahora</small>
          </button>
          <button type="button" disabled={full || preparing} onClick={() => libraryRef.current?.click()}>
            <Images aria-hidden="true" />
            <strong>Galería</strong>
            <small>Elegir fotos guardadas</small>
          </button>
        </div>
        <p className={styles.counter} aria-live="polite">{photos.length} de {cantidadFotos(limit)}{full ? " · Límite alcanzado" : ""}</p>
        {photos.length > 0 && (
          <div className="revision-photo-grid">
            {photos.map((photo, index) => (
              <RevisionPhotoPreview key={photo.id} photo={photo} index={index} label={photoLabel(index)} disabled={preparing} active={open} onRemove={() => onRemove(photo.id)} />
            ))}
          </div>
        )}
        {preparing && <p className={styles.status} role="status">Comprimiendo fotos…</p>}
        {error && <p className={styles.notice} role="alert"><TriangleAlert size={15} aria-hidden="true" />{error}</p>}
        <div className={`sheet-actions ${styles.sheetActions}`}>
          <button type="button" className={`secondary-button ${styles.secondary}`} onClick={onClose}>Cancelar</button>
          <button type="button" className={`primary-button ${styles.primary}`} disabled={!photos.length || preparing} onClick={onScan}>
            <ScanSearch size={17} aria-hidden="true" />{photos.length ? `Escanear ${cantidadFotos(photos.length)}` : "Escanear"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export function RecognitionScanCard({ photos, limit, scan, stale, scanning, progress, error, disabled, active, onOpenSheet, onRescan, onRemove, children }: {
  photos: RevisionPhoto[];
  limit: number;
  scan: RevisionScan | null;
  stale: boolean;
  scanning: boolean;
  progress: string;
  error: string;
  disabled: boolean;
  active: boolean;
  onOpenSheet: () => void;
  onRescan: () => void;
  onRemove: (photoId: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className={styles.recognition} data-revision-evidencias="" tabIndex={-1}>
      {limit === 0 ? (
        <div className={styles.empty}>
          <ScanSearch size={26} strokeWidth={1.5} aria-hidden="true" />
          <strong>Elige el estado de la caja fuerte</strong>
          <p>La cantidad de fotos que puedes escanear depende de esa opción.</p>
        </div>
      ) : photos.length === 0 && !scanning ? (
        <div className={styles.empty}>
          <ScanSearch size={26} strokeWidth={1.5} aria-hidden="true" />
          <strong>Escanea hasta {cantidadFotos(limit)}</strong>
          <p>Toma o elige fotos donde se vean los artículos de la casita.</p>
        </div>
      ) : (
        <div className="revision-photo-grid">
          {photos.map((photo, index) => (
            <RevisionPhotoPreview key={photo.id} photo={photo} index={index} disabled={disabled} active={active} onRemove={() => onRemove(photo.id)} />
          ))}
        </div>
      )}
      {scanning && (
        <div className={styles.scanning} role="status" aria-live="polite">
          <span className={styles.scanningLabel}><LoaderCircle size={16} className="revision-spinner" aria-hidden="true" />{progress || "Escaneando…"}</span>
          <span className={styles.skeleton} aria-hidden="true" />
          <span className={styles.skeleton} aria-hidden="true" />
          <span className={styles.skeleton} aria-hidden="true" />
        </div>
      )}
      {!scanning && scan && !stale && (
        <p className={styles.scanMeta}><CircleCheck size={14} aria-hidden="true" />Escaneado con {cantidadFotos(scan.photoIds.length)}. Revisa y corrige los conteos abajo.</p>
      )}
      {!scanning && stale && (
        <p className={`${styles.notice} ${styles.info}`} role="status"><TriangleAlert size={15} aria-hidden="true" />Las fotos cambiaron después del escaneo. Vuelve a escanear para actualizar los conteos.</p>
      )}
      {error && <p className={styles.notice} role="alert"><TriangleAlert size={15} aria-hidden="true" />{error}</p>}
      {children}
      {limit > 0 && !scanning && (
        <div className={styles.actions}>
          <button type="button" className="secondary-button" disabled={disabled} onClick={onOpenSheet}>
            <Camera size={17} aria-hidden="true" />{photos.length ? "Cambiar fotos" : "Elegir fotos"}
          </button>
          {photos.length > 0 && (
            <button type="button" className="primary-button" disabled={disabled} onClick={onRescan}>
              {scan ? <RefreshCw size={17} aria-hidden="true" /> : <ScanSearch size={17} aria-hidden="true" />}{scan ? "Volver a escanear" : "Escanear"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function hintText(item: ComparacionArticulo) {
  const detectado = item.detectado === null ? "No se reconoce en fotos" : `Detectado ${textoCantidad(item.key, item.detectado)}`;
  return item.esperado === null ? detectado : `${detectado} · Inventario ${textoCantidad(item.key, item.esperado)}`;
}

function badgeFor(item: ComparacionArticulo) {
  if (item.coincideAhora === null) return null;
  return item.coincideAhora
    ? <span className={`${styles.badge} ${styles.badgeOk}`}><CircleCheck size={12} aria-hidden="true" />Coincide</span>
    : <span className={`${styles.badge} ${styles.badgeAlert}`}><TriangleAlert size={12} aria-hidden="true" />Revisar</span>;
}

function inventoryText(status: InventarioStatus, casita: string, found: boolean) {
  if (!casita) return "Selecciona la casita para comparar con su inventario.";
  if (status === "loading" && !found) return "Cargando el inventario de la casita…";
  if (!found) return status === "error" ? "No pudimos cargar el inventario. Revisa los conteos manualmente." : `No hay inventario registrado para la casita ${casita}.`;
  return status === "actualizado" ? `Comparado con el inventario de la casita ${casita}.` : `Comparado con el inventario guardado en este dispositivo (casita ${casita}).`;
}

export function RecognitionResults({ values, scan, inventario, inventarioStatus, onRetryInventario, renderField }: {
  values: RevisionFormValues;
  scan: RevisionScan;
  inventario: InventarioCasita | null;
  inventarioStatus: InventarioStatus;
  onRetryInventario: () => void;
  renderField: (key: InventarioKey, extras: { badge: ReactNode; hint: ReactNode }) => ReactNode;
}) {
  const { revisar, coinciden, sinComparar } = compararInventario(values, scan.detectados, inventario);
  const all = [...revisar, ...coinciden];
  const pendientes = all.filter((item) => item.coincideAhora === false).length;
  const casita = values.casita ? String(Number(values.casita)) : "";
  const row = (item: ComparacionArticulo, tone: "alert" | "ok" | "none") => (
    <div key={item.key} className={styles.row} data-tone={tone === "alert" && item.coincideAhora === false ? "alert" : undefined}>
      {renderField(item.key, { badge: badgeFor(item), hint: hintText(item) })}
    </div>
  );
  return (
    <div className={styles.recognition}>
      {inventario && (
        <div className={styles.summary} aria-live="polite">
          {pendientes > 0
            ? <span className={styles.badgeAlert}><TriangleAlert size={13} aria-hidden="true" />{pendientes} por revisar</span>
            : <span className={styles.badgeOk}><CircleCheck size={13} aria-hidden="true" />Todo coincide</span>}
          <span className={styles.badgeOk}>{all.length - pendientes} coinciden</span>
        </div>
      )}
      <div className={styles.inventory}>
        <span>{inventoryText(inventarioStatus, casita, inventario !== null)}</span>
        {casita && !inventario && inventarioStatus === "error" && <button type="button" onClick={onRetryInventario}>Reintentar</button>}
      </div>
      {revisar.length > 0 && (
        <section className={styles.group} aria-label="Artículos por revisar">
          <h3 className={`${styles.groupTitle} ${styles.alert}`}><TriangleAlert size={14} aria-hidden="true" />Revisar</h3>
          {revisar.map((item) => row(item, "alert"))}
        </section>
      )}
      {coinciden.length > 0 && (
        <section className={styles.group} aria-label="Artículos que coinciden">
          <h3 className={`${styles.groupTitle} ${styles.ok}`}><CircleCheck size={14} aria-hidden="true" />Coinciden</h3>
          {coinciden.map((item) => row(item, "ok"))}
        </section>
      )}
      {sinComparar.length > 0 && (
        <section className={styles.group} aria-label="Conteo detectado">
          <h3 className={styles.groupTitle}>Conteo detectado</h3>
          {sinComparar.map((item) => row(item, "none"))}
        </section>
      )}
    </div>
  );
}
