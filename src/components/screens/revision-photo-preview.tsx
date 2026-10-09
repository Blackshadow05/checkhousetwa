"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Maximize2, X } from "lucide-react";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";
import type { FaseRevelado } from "@/hooks/use-revelado-escaneo";
import type { RevisionPhoto, RevisionScanBox } from "@/lib/revision-form";

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
export type PhotoStatus = { text: string; tone?: "busy" | "queued" | "scanning" | "done" | "error"; phase?: FaseRevelado; cajas?: readonly RevisionScanBox[] };

const SVG_NS = "http://www.w3.org/2000/svg";

function closeViewer(viewer: PhotoSwipe | null) {
  if (!viewer || viewer.isDestroying) return;
  if (viewer.opener.isOpen) viewer.close();
  else viewer.on("openingAnimationEnd", () => viewer.close());
}

function safeAreaInsets() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.append(probe);
  const insets = getComputedStyle(probe);
  const value = { top: parseFloat(insets.paddingTop) || 0, right: parseFloat(insets.paddingRight) || 0, bottom: parseFloat(insets.paddingBottom) || 0, left: parseFloat(insets.paddingLeft) || 0 };
  probe.remove();
  return value;
}

function viewerMarks(marks: readonly PhotoMark[], width: number, height: number) {
  const font = Math.max(width, height) * 0.028;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "revision-photo-marks");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.zIndex = "1";
  for (const mark of marks) {
    const x = mark.x * width;
    const y = mark.y * height;
    const group = document.createElementNS(SVG_NS, "g");
    const rect = document.createElementNS(SVG_NS, "rect");
    for (const [name, value] of Object.entries({ x, y, width: mark.w * width, height: mark.h * height, rx: font * 0.2, "vector-effect": "non-scaling-stroke" })) rect.setAttribute(name, String(value));
    const text = document.createElementNS(SVG_NS, "text");
    const top = y - font * 0.4 > font;
    for (const [name, value] of Object.entries({ x: x + font * 0.2, y: top ? y - font * 0.4 : y + font * 1.1, "font-size": font, "stroke-width": font * 0.22 })) text.setAttribute(name, String(value));
    text.textContent = mark.label;
    group.append(rect, text);
    svg.append(group);
  }
  return svg;
}

function PhotoMarks({ marks, width, height }: { marks: readonly PhotoMark[]; width: number; height: number }) {
  const font = Math.max(width, height) * 0.028;
  return (
    <svg className="revision-photo-marks" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {marks.map((mark, index) => {
        const x = mark.x * width;
        const y = mark.y * height;
        return (
          <g key={index}>
            <rect x={x} y={y} width={mark.w * width} height={mark.h * height} rx={font * 0.2} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

function ScanBoxes({ cajas, width, height }: { cajas: readonly RevisionScanBox[]; width: number; height: number }) {
  const radius = Math.max(width, height) * 0.006;
  return (
    <svg className="revision-photo-scan-boxes" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {cajas.map((caja, index) => (
        <rect key={index} x={caja.x * width} y={caja.y * height} width={caja.w * width} height={caja.h * height} rx={radius}
          vectorEffect="non-scaling-stroke" style={{ animationDelay: `${Math.round(Math.min(1, caja.y + caja.h / 2) * 720)}ms` }} />
      ))}
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewerRef = useRef<PhotoSwipe | null>(null);
  const urlRef = useRef("");
  const activeRef = useRef(active);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const marked = marks?.length && natural ? marks : null;
  const size = photoSize(photo.blob.size);
  const format = photo.blob.type === "image/webp" ? "WebP" : "JPEG";

  useEffect(() => {
    // Both views use the exact compressed Blob that will be uploaded.
    const url = URL.createObjectURL(photo.blob);
    urlRef.current = url;
    if (thumbnailRef.current) thumbnailRef.current.src = url;
    return () => {
      closeViewer(viewerRef.current);
      urlRef.current = "";
      URL.revokeObjectURL(url);
    };
  }, [photo.blob]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) closeViewer(viewerRef.current);
  }, [active]);

  const label = labelOverride ?? evidenceLabel(index);

  const openViewer = () => {
    if (viewerRef.current || !urlRef.current) return;
    const insets = safeAreaInsets();
    const width = natural?.width || 1600;
    const height = natural?.height || 1200;
    const viewer = new PhotoSwipe({
      dataSource: [{ src: urlRef.current, width, height, alt: label }],
      index: 0,
      padding: { top: 60 + insets.top, right: insets.right, bottom: 60 + insets.bottom, left: insets.left },
      mainClass: "evidence-pswp",
      bgOpacity: 1,
      showHideAnimationType: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "fade",
      wheelToZoom: true,
      closeTitle: "Cerrar imagen",
      zoomTitle: "Ampliar o reducir imagen",
      errorMsg: "No se pudo mostrar la foto.",
    });
    viewerRef.current = viewer;
    const overlay = marked && natural ? viewerMarks(marked, natural.width, natural.height) : null;
    const sizeOverlay = (displayWidth: number, displayHeight: number) => {
      if (!overlay || !displayWidth) return;
      overlay.style.width = `${displayWidth}px`;
      overlay.style.height = `${displayHeight}px`;
    };

    viewer.on("loadComplete", ({ content }) => {
      const image = content.element;
      if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return;
      if (content.data.width === image.naturalWidth && content.data.height === image.naturalHeight) return;
      content.data.width = image.naturalWidth;
      content.data.height = image.naturalHeight;
      viewer.refreshSlideContent(content.index);
    });
    viewer.on("contentAppend", ({ content }) => {
      if (!overlay || !content.slide) return;
      content.slide.container.append(overlay);
      sizeOverlay(content.displayedImageWidth, content.displayedImageHeight);
    });
    viewer.on("contentResize", ({ width: displayWidth, height: displayHeight }) => sizeOverlay(displayWidth, displayHeight));
    viewer.on("uiRegister", () => {
      viewer.ui?.registerElement({
        name: "photo-caption",
        appendTo: "root",
        onInit: (element) => {
          element.className = "evidence-pswp-status";
          element.textContent = `${label} · ${format} · ${width} × ${height} px`;
        },
      });
    });
    viewer.on("destroy", () => {
      overlay?.remove();
      viewerRef.current = null;
      if (activeRef.current) triggerRef.current?.focus({ preventScroll: true });
    });
    viewer.init();
    viewer.element?.setAttribute("aria-modal", "true");
    viewer.element?.setAttribute("aria-label", label);
  };

  return (
    <figure className="revision-photo" data-state={status?.tone} data-phase={status?.phase}>
      <button ref={triggerRef} type="button" className="revision-photo-open" disabled={disabled}
        aria-label={`Abrir ${label}, ${status?.text ?? size}${marked ? `, ${marked.length === 1 ? "1 artículo marcado" : `${marked.length} artículos marcados`}` : ""}`} onClick={openViewer}>
        {/* Local Blob URLs must bypass the remote image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={thumbnailRef} alt={label} onLoad={(event) => {
          const image = event.currentTarget;
          setNatural({ width: image.naturalWidth, height: image.naturalHeight });
        }} />
        {marked && natural && <PhotoMarks marks={marked} width={natural.width} height={natural.height} />}
        {status?.phase === "escanea" && status.cajas?.length && natural ? <ScanBoxes cajas={status.cajas} width={natural.width} height={natural.height} /> : null}
        {status?.phase && status.phase !== "encoge" && <span className="revision-photo-scan" aria-hidden="true">{status.phase === "escanea" && <span className="revision-photo-scan-line" />}</span>}
        {status?.phase === "encoge" && status.tone === "done" && <span className="revision-photo-scan-check" aria-hidden="true"><Check size={20} strokeWidth={3} /></span>}
        <span className="revision-photo-expand" aria-hidden="true"><Maximize2 size={15} /></span>
      </button>
      <button type="button" className="revision-photo-remove" onClick={onRemove} disabled={disabled} aria-label={`Quitar ${label}`}><X size={17} /></button>
      <figcaption><strong>{label}</strong><span>{status?.text ?? size}</span></figcaption>
    </figure>
  );
}
