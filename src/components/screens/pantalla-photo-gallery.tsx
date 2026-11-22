"use client";

import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";
import { ESTADO_PANTALLA_LABELS, type PantallaEstado, type PantallaFoto } from "@/lib/pantallas";
import styles from "./pantalla-photo-gallery.module.css";

const DOWNLOAD_ICON = '<svg class="pswp__icn pswp__icn--custom" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15m-6-6 6 6 6-6M7 22v5h18v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function closeViewer(viewer: PhotoSwipe | null) {
  if (!viewer || viewer.isDestroying) return;
  if (viewer.opener.isOpen) viewer.close();
  else viewer.on("openingAnimationEnd", () => viewer.close());
}

export function PantallaPhotoGallery({ photos, casita, reportId, active }: {
  photos: PantallaFoto[];
  casita: number | null;
  reportId: number;
  active: boolean;
}) {
  const thumbnails = useRef<(HTMLImageElement | null)[]>([]);
  const viewerRef = useRef<PhotoSwipe | null>(null);

  useEffect(() => () => closeViewer(viewerRef.current), []);
  useEffect(() => {
    if (!active) closeViewer(viewerRef.current);
  }, [active]);

  const openPhoto = (index: number) => {
    if (viewerRef.current) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.append(probe);
    const insets = getComputedStyle(probe);
    const padding = {
      top: 60 + parseFloat(insets.paddingTop),
      right: parseFloat(insets.paddingRight),
      bottom: 100 + parseFloat(insets.paddingBottom),
      left: parseFloat(insets.paddingLeft),
    };
    probe.remove();
    const viewer = new PhotoSwipe({
      dataSource: photos.map((photo, i) => ({
        src: photo.url,
        width: thumbnails.current[i]?.naturalWidth || 1600,
        height: thumbnails.current[i]?.naturalHeight || 1200,
        alt: `Casita ${casita}, ${photo.ubicacion}: ${photo.estado}`,
      })),
      index,
      padding,
      mainClass: `evidence-pswp ${styles.viewer}`,
      bgOpacity: 1,
      showHideAnimationType: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "fade",
      wheelToZoom: true,
      closeTitle: "Cerrar imagen",
      zoomTitle: "Ampliar o reducir imagen",
      arrowPrevTitle: "Foto anterior",
      arrowNextTitle: "Foto siguiente",
      indexIndicatorSep: " de ",
      errorMsg: "No se pudo cargar la foto. Revisa la conexión e inténtalo de nuevo.",
    });
    viewerRef.current = viewer;
    let downloadController: AbortController | null = null;
    let prefetchController: AbortController | null = null;
    let status: HTMLElement | null = null;
    const blobCache = new Map<string, File>();

    const fileForPhoto = async (photo: PantallaFoto, photoIndex: number, signal: AbortSignal) => {
      const cached = blobCache.get(photo.url);
      if (cached) return cached;
      const response = await fetch(photo.url, { signal });
      if (!response.ok) throw new Error("download");
      const blob = await response.blob();
      const extension = ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[blob.type] || "jpg";
      const file = new File([blob], `casita-${casita}-pantalla-${reportId}-${photoIndex + 1}.${extension}`, { type: blob.type || "image/jpeg" });
      blobCache.set(photo.url, file);
      return file;
    };

    const canShareFile = (file: File) =>
      typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files: [file] });

    viewer.on("loadComplete", ({ content }) => {
      const image = content.element;
      if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return;
      if (content.data.width === image.naturalWidth && content.data.height === image.naturalHeight) return;
      content.data.width = image.naturalWidth;
      content.data.height = image.naturalHeight;
      viewer.refreshSlideContent(content.index);
    });
    viewer.on("uiRegister", () => {
      viewer.ui?.registerElement({
        name: "photo-caption",
        appendTo: "root",
        onInit: (element) => {
          element.className = styles.caption;
          const caption = document.createElement("p");
          status = document.createElement("p");
          status.setAttribute("role", "status");
          element.append(caption, status);
          const update = () => {
            const photoIndex = viewer.currIndex;
            const photo = photos[photoIndex];
            if (!photo) return;
            const estadoTexto = ESTADO_PANTALLA_LABELS[photo.estado as PantallaEstado] || photo.estado;
            caption.textContent = `Casita ${casita} · ${photo.ubicacion} · ${estadoTexto}`;
            if (status) status.textContent = "";
            prefetchController?.abort();
            if (!blobCache.has(photo.url) && navigator.onLine && typeof navigator.share === "function") {
              const controller = new AbortController();
              prefetchController = controller;
              void fileForPhoto(photo, photoIndex, controller.signal).catch(() => undefined);
            }
          };
          viewer.on("change", update);
          update();
        },
      });
      viewer.ui?.registerElement({
        name: "download-photo",
        order: 9,
        isButton: true,
        title: "Guardar o descargar foto",
        html: DOWNLOAD_ICON,
        onClick: async (_event, element) => {
          if (downloadController) return;
          const photoIndex = viewer.currIndex;
          const photo = photos[photoIndex];
          if (!photo) return;
          const cachedFile = blobCache.get(photo.url);
          const controller = new AbortController();
          downloadController = controller;
          const timeout = window.setTimeout(() => controller.abort(), 30000);
          element.setAttribute("disabled", "");
          if (status) status.textContent = cachedFile ? "Abriendo opciones…" : "Preparando foto…";
          try {
            const file = cachedFile ?? await fileForPhoto(photo, photoIndex, controller.signal);
            if (canShareFile(file)) {
              try {
                await navigator.share({ files: [file] });
                if (status && viewer.currIndex === photoIndex) status.textContent = "";
                return;
              } catch (shareError) {
                if (shareError instanceof Error && shareError.name === "AbortError") {
                  if (status && viewer.currIndex === photoIndex) status.textContent = "";
                  return;
                }
                if (shareError instanceof Error && shareError.name === "NotAllowedError") {
                  if (status && viewer.currIndex === photoIndex) status.textContent = "Foto lista. Pulsa de nuevo para guardar o compartir.";
                  return;
                }
              }
            }
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            if (status && viewer.currIndex === photoIndex) status.textContent = "Descarga iniciada.";
          } catch {
            if (status && viewer.currIndex === photoIndex) status.textContent = "No se pudo descargar la foto. Revisa la conexión y vuelve a intentarlo.";
          } finally {
            clearTimeout(timeout);
            downloadController = null;
            element.removeAttribute("disabled");
          }
        },
      });
    });
    viewer.on("destroy", () => {
      prefetchController?.abort();
      downloadController?.abort();
      blobCache.clear();
      viewerRef.current = null;
    });
    viewer.init();
    viewer.element?.setAttribute("aria-modal", "true");
    viewer.element?.setAttribute("aria-label", `Fotos del reporte de pantallas de casita ${casita}`);
  };

  return <div className={`pantalla-photos ${styles.gallery}`}>
    {photos.map((photo, index) => <figure key={`${photo.url}-${index}`}>
      <button type="button" className={styles.open} onClick={() => openPhoto(index)} aria-label={`Abrir foto de ${photo.ubicacion}, casita ${casita}: ${photo.estado}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={(image) => { thumbnails.current[index] = image; }} src={photo.url} alt={`${photo.ubicacion}: ${photo.estado}`} loading="lazy" crossOrigin="anonymous" />
        <span className={styles.expand} aria-hidden="true"><Maximize2 size={16} /></span>
      </button>
      <figcaption><strong>{photo.ubicacion}</strong><span className={["defectuosa", "moderada", "grave"].includes(photo.estado) ? "pantalla-bad" : ""}>{ESTADO_PANTALLA_LABELS[photo.estado as PantallaEstado] || photo.estado}{photo.puntos != null && photo.estado !== "no hay pantalla" && photo.estado !== "en buen estado" ? ` · ${photo.puntos} ${photo.puntos === 1 ? "punto" : "puntos"}` : ""}</span></figcaption>
    </figure>)}
  </div>;
}
