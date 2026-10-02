"use client";

import { useRef, type ReactNode } from "react";
import { Camera, CircleCheck, Images, LoaderCircle, ScanSearch, TriangleAlert } from "lucide-react";
import { RevisionPhotoPreview, type PhotoMark, type PhotoStatus } from "@/components/screens/revision-photo-preview";
import { compararInventario, isReconocible, textoCantidad, valorDetectado, type ComparacionArticulo, type InventarioCasita, type InventarioKey } from "@/lib/inventario-casitas";
import type { InventarioStatus } from "@/hooks/use-inventario-casitas";
import type { RevisionFormValues, RevisionPhoto, RevisionScan } from "@/lib/revision-form";
import styles from "./revision-recognition.module.css";

export { styles as recognitionStyles };

export type FotoPrevia = { id: string; url: string };

function photoLabel(index: number) {
  return `Foto ${String(index + 1).padStart(2, "0")}`;
}

function cantidadFotos(count: number) {
  return count === 1 ? "1 foto" : `${count} fotos`;
}

function FotoPreparando({ url, label }: { url: string; label: string }) {
  return (
    <figure className="revision-photo" data-state="busy">
      <div className="revision-photo-open" style={{ backgroundImage: `url("${url}")` }} role="img" aria-label={`${label}, preparando`} />
      <figcaption><strong>{label}</strong><span>Preparando…</span></figcaption>
    </figure>
  );
}

export function RecognitionScanCard({ photos, previas, limit, scan, status, marks, error, disabled, active, onPick, onRemove, onRetry, children }: {
  photos: RevisionPhoto[];
  previas: FotoPrevia[];
  limit: number;
  scan: RevisionScan | null;
  status: (photoId: string) => PhotoStatus;
  marks?: ReadonlyMap<string, PhotoMark[]>;
  error: string;
  disabled: boolean;
  active: boolean;
  onPick: (files: FileList | null) => void;
  onRemove: (photoId: string) => void;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const total = photos.length + previas.length;
  const restantes = limit - total;
  const trabajando = previas.length > 0 || photos.some((photo) => status(photo.id).tone === "busy");
  const listo = !trabajando && !error && scan && scan.photoIds.length === photos.length;
  return (
    <div className={styles.recognition} data-revision-evidencias="" tabIndex={-1}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { onPick(event.target.files); event.target.value = ""; }} />
      <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={restantes > 1} hidden onChange={(event) => { onPick(event.target.files); event.target.value = ""; }} />
      {limit === 0 ? (
        <div className={styles.empty}>
          <ScanSearch size={26} strokeWidth={1.5} aria-hidden="true" />
          <strong>Elige el estado de la caja fuerte</strong>
          <p>La cantidad de fotos depende de esa opción.</p>
        </div>
      ) : total === 0 ? (
        <div className={styles.empty}>
          <ScanSearch size={26} strokeWidth={1.5} aria-hidden="true" />
          <strong>Fotografía los artículos</strong>
          <p>Hasta {cantidadFotos(limit)}. Se cuentan solos.</p>
        </div>
      ) : (
        <div className="revision-photo-grid">
          {photos.map((photo, index) => (
            <RevisionPhotoPreview key={photo.id} photo={photo} index={index} label={photoLabel(index)} disabled={disabled} active={active}
              marks={marks?.get(photo.id)} status={status(photo.id)} onRemove={() => onRemove(photo.id)} />
          ))}
          {previas.map((previa, index) => <FotoPreparando key={previa.id} url={previa.url} label={photoLabel(photos.length + index)} />)}
        </div>
      )}
      <p className={trabajando || listo ? styles.scanMeta : "sr-only"} aria-live="polite">
        {trabajando
          ? <><LoaderCircle size={14} className="revision-spinner" aria-hidden="true" />Contando artículos…</>
          : listo
            ? <><CircleCheck size={14} aria-hidden="true" />{marks?.size ? "En rojo los artículos por revisar." : "Revisa y corrige los conteos abajo."}</>
            : null}
      </p>
      {error && (
        <div className={styles.notice} role="alert">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}
        </div>
      )}
      {children}
      {limit > 0 && restantes > 0 && (
        <ul className={styles.tips} aria-label="Para una buena foto">
          <li>No coloques objetos encima de otros.</li>
          <li>Foto clara y con buena iluminación.</li>
          <li>Separa los objetos; no hechos una pelota.</li>
        </ul>
      )}
      {limit > 0 && restantes > 0 && (
        <div className={styles.actions}>
          <button type="button" className="primary-button" disabled={disabled} onClick={() => cameraRef.current?.click()}>
            <Camera size={17} aria-hidden="true" />Tomar foto
          </button>
          <button type="button" className="secondary-button" disabled={disabled} onClick={() => libraryRef.current?.click()}>
            <Images size={17} aria-hidden="true" />Galería
          </button>
        </div>
      )}
    </div>
  );
}

function hintText(item: ComparacionArticulo, values: RevisionFormValues) {
  if (item.detectado === null) return "No se reconoce en fotos";
  const changed = isReconocible(item.key) && values[item.key] !== valorDetectado(item.key, item.detectado);
  return `Detectado ${textoCantidad(item.key, item.detectado)}${changed ? " · Modificado manualmente" : ""}`;
}

function badgeFor(item: ComparacionArticulo) {
  if (item.coincideAhora === null) return null;
  return item.coincideAhora
    ? <span className={`${styles.badge} ${styles.badgeOk}`}><CircleCheck size={12} aria-hidden="true" />Identificado</span>
    : <span className={`${styles.badge} ${styles.badgeAlert}`}><TriangleAlert size={12} aria-hidden="true" />Revisar</span>;
}

function inventoryText(status: InventarioStatus, casita: string, found: boolean) {
  if (!casita) return "Selecciona la casita para comparar con su inventario.";
  if (status === "loading" && !found) return "Cargando el inventario de la casita…";
  if (!found) return status === "error" ? "No pudimos cargar el inventario. Revisa los conteos manualmente." : `No hay inventario registrado para la casita ${casita}.`;
  return status === "actualizado" ? `Comparado con el inventario de la casita ${casita}.` : `Comparado con el inventario guardado en este dispositivo (casita ${casita}).`;
}

export function RecognitionResults({ values, scan, inventario, inventarioStatus, onRetryInventario, renderField, renderCamas }: {
  values: RevisionFormValues;
  scan: RevisionScan;
  inventario: InventarioCasita | null;
  inventarioStatus: InventarioStatus;
  onRetryInventario: () => void;
  renderField: (key: InventarioKey, extras: { badge: ReactNode; hint: ReactNode }) => ReactNode;
  renderCamas: (extras: { badge: ReactNode; hint: ReactNode }) => ReactNode;
}) {
  const { revisar, coinciden, sinComparar } = compararInventario(values, scan.detectados, inventario);
  const all = [...revisar, ...coinciden];
  const camasPendientes = values.camas_ordenadas !== "Si" && values.camas_ordenadas !== "No";
  const pendientes = all.filter((item) => item.coincideAhora === false).length + (camasPendientes ? 1 : 0);
  const casita = values.casita ? String(Number(values.casita)) : "";
  const row = (item: ComparacionArticulo, tone: "alert" | "ok" | "none") => (
    <div key={item.key} className={styles.row} data-tone={tone === "alert" && item.coincideAhora === false ? "alert" : undefined}>
      {renderField(item.key, { badge: badgeFor(item), hint: hintText(item, values) })}
    </div>
  );
  return (
    <div className={styles.recognition}>
      {inventario && (
        <div className={styles.summary} aria-live="polite">
          {pendientes > 0
            ? <span className={styles.badgeAlert}><TriangleAlert size={13} aria-hidden="true" />{pendientes} por revisar</span>
            : <span className={styles.badgeOk}><CircleCheck size={13} aria-hidden="true" />Todo identificado</span>}
          <span className={styles.badgeOk}>Identificado · {all.filter((item) => item.coincideAhora !== false).length}</span>
        </div>
      )}
      <div className={styles.inventory}>
        <span>{inventoryText(inventarioStatus, casita, inventario !== null)}</span>
        {casita && !inventario && inventarioStatus === "error" && <button type="button" onClick={onRetryInventario}>Reintentar</button>}
      </div>
      {(revisar.length > 0 || camasPendientes) && (
        <section className={styles.group} aria-label="Artículos por revisar">
          <h3 className={`${styles.groupTitle} ${styles.alert}`}><TriangleAlert size={14} aria-hidden="true" />Revisar</h3>
          {camasPendientes && (
            <div className={styles.row} data-tone="alert">
              {renderCamas({
                badge: <span className={`${styles.badge} ${styles.badgeAlert}`}><TriangleAlert size={12} aria-hidden="true" />Revisar</span>,
                hint: "No se reconoce en fotos",
              })}
            </div>
          )}
          {revisar.map((item) => row(item, "alert"))}
        </section>
      )}
      {coinciden.length > 0 && (
        <section className={styles.group} aria-label="Artículos identificados">
          <h3 className={`${styles.groupTitle} ${styles.ok}`}><CircleCheck size={14} aria-hidden="true" />Identificado</h3>
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
