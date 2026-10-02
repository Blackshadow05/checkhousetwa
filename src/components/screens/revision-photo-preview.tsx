"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { RevisionPhoto } from "@/lib/revision-form";

function evidenceLabel(index: number) {
  return `Evidencia ${String(index + 1).padStart(2, "0")}`;
}

function photoSize(bytes: number) {
  const format = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${format.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${format.format(bytes / 1024)} KB`;
  return `${format.format(bytes / (1024 * 1024))} MB`;
}

export type PhotoMark = { label: string; x: number; y: number; w: number; h: number };
export type PhotoStatus = { text: string; tone?: "busy" | "done" | "error" };

function PhotoMarks({ marks, width, height, fit, labels }: {
  marks: readonly PhotoMark[]; width: number; height: number; fit: "slice" | "meet"; labels: boolean;
}) {
  const font = Math.max(width, height) * 0.028;
  return (
    <svg className="revision-photo-marks" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={`xMidYMid ${fit}`} aria-hidden="true">
      {marks.map((mark, index) => {
        const x = mark.x * width;
        const y = mark.y * height;
        const top = y - font * 0.4 > font;
        return (
          <g key={index}>
            <rect x={x} y={y} width={mark.w * width} height={mark.h * height} rx={font * 0.2} vectorEffect="non-scaling-stroke" />
            {labels && <text x={x + font * 0.2} y={top ? y - font * 0.4 : y + font * 1.1} fontSize={font} strokeWidth={font * 0.22}>{mark.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function RevisionPhotoPreview({ photo, index, onRemove, disabled, active, label: labelOverride, marks, status }: {
  photo: RevisionPhoto;
  index: number;
  onRemove: () => void;
  disabled: boolean;
  active: boolean;
  label?: string;
  marks?: readonly PhotoMark[];
  status?: PhotoStatus;
}) {
  const thumbnailRef = useRef<HTMLImageElement>(null);
  const fullImageRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const [dimensions, setDimensions] = useState("");
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const marked = marks?.length && natural ? marks : null;
  const size = photoSize(photo.blob.size);
  const format = photo.blob.type === "image/webp" ? "WebP" : "JPEG";
  const titleId = `photo-preview-${photo.id}`;

  useEffect(() => {
    // Both views use the exact compressed Blob that will be uploaded.
    const url = URL.createObjectURL(photo.blob);
    if (thumbnailRef.current) thumbnailRef.current.src = url;
    if (fullImageRef.current) fullImageRef.current.src = url;
    const dialog = dialogRef.current;
    return () => {
      dialog?.close();
      URL.revokeObjectURL(url);
    };
  }, [photo.blob]);

  useEffect(() => {
    if (!active) dialogRef.current?.close();
  }, [active]);

  const label = labelOverride ?? evidenceLabel(index);

  return <>
    <figure className="revision-photo" data-state={status?.tone}>
      <button ref={triggerRef} type="button" className="revision-photo-open" disabled={disabled}
        aria-label={`Abrir ${label}, ${status?.text ?? size}${marked ? `, ${marked.length === 1 ? "1 artículo marcado" : `${marked.length} artículos marcados`}` : ""}`} onClick={() => dialogRef.current?.showModal()}>
        {/* Local Blob URLs must bypass the remote image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={thumbnailRef} alt={label} onLoad={(event) => {
          const image = event.currentTarget;
          setNatural({ width: image.naturalWidth, height: image.naturalHeight });
        }} />
        {marked && natural && <PhotoMarks marks={marked} width={natural.width} height={natural.height} fit="slice" labels={false} />}
        <span className="revision-photo-expand" aria-hidden="true"><Maximize2 size={15} /></span>
      </button>
      <button type="button" className="revision-photo-remove" onClick={onRemove} disabled={disabled} aria-label={`Quitar ${label}`}><X size={17} /></button>
      <figcaption><strong>{label}</strong><span>{status?.text ?? size}</span></figcaption>
    </figure>

    <dialog ref={dialogRef} className="revision-photo-viewer" aria-labelledby={titleId}
      onClose={() => { setZoomed(false); if (active) triggerRef.current?.focus({ preventScroll: true }); }}>
      <div className="revision-photo-viewer-layout">
        <header className="revision-photo-viewer-header">
          <div><h2 id={titleId}>{label}</h2></div>
          <button type="button" autoFocus aria-label="Cerrar imagen" onClick={() => dialogRef.current?.close()}><X size={24} /></button>
        </header>
        <div className={`revision-photo-viewer-image${zoomed ? " is-zoomed" : ""}`}>
          <div className="revision-photo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={fullImageRef} alt={label} onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions(`${image.naturalWidth} × ${image.naturalHeight} px`);
            }} />
            {marked && natural && <PhotoMarks marks={marked} width={natural.width} height={natural.height} fit="meet" labels />}
          </div>
        </div>
        <footer className="revision-photo-viewer-footer">
          <span>{format}{dimensions ? ` · ${dimensions}` : ""}</span>
          <button type="button" aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)}>
            {zoomed ? <Minimize2 size={18} /> : <Maximize2 size={18} />}{zoomed ? "Ajustar" : "Ampliar"}
          </button>
        </footer>
      </div>
    </dialog>
  </>;
}
