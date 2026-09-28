"use client";

import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";
import type { PantallaFoto } from "@/lib/pantallas";
import styles from "./pantalla-photo-gallery.module.css";

const DOWNLOAD_ICON = '<svg class="pswp__icn" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15m-6-6 6 6 6-6M7 22v5h18v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    let status: HTMLElement | null = null;

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
            const photo = photos[viewer.currIndex];
            caption.textContent = `Casita ${casita} · ${photo.ubicacion} · ${photo.estado}`;
          };
          viewer.on("change", update);
          update();
        },
      });
      viewer.ui?.registerElement({
        name: "download-photo",
        order: 9,
        isButton: true,
        title: "Descargar foto",
        html: DOWNLOAD_ICON,
        onClick: async (_event, element) => {
          if (downloadController) return;
          const photoIndex = viewer.currIndex;
          const photo = photos[photoIndex];
          const controller = new AbortController();
          downloadController = controller;
          const timeout = window.setTimeout(() => controller.abort(), 30000);
          element.setAttribute("disabled", "");
          if (status) status.textContent = "Preparando descarga…";
          try {
            const response = await fetch(photo.url, { signal: controller.signal });
            if (!response.ok) throw new Error("download");
            const blob = await response.blob();
            const extension = ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[blob.type] || "jpg";
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `casita-${casita}-pantalla-${reportId}-${photoIndex + 1}.${extension}`;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            if (status) status.textContent = "Descarga iniciada.";
          } catch {
            if (status) status.textContent = "No se pudo descargar la foto. Revisa la conexión y vuelve a intentarlo.";
          } finally {
            clearTimeout(timeout);
            downloadController = null;
            element.removeAttribute("disabled");
          }
        },
      });
    });
    viewer.on("destroy", () => {
      downloadController?.abort();
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
      <figcaption><strong>{photo.ubicacion}</strong><span className={["defectuosa", "moderada", "grave"].includes(photo.estado) ? "pantalla-bad" : ""}>{photo.estado}{photo.puntos != null && photo.estado !== "no hay pantalla" ? ` · ${photo.puntos} ${photo.puntos === 1 ? "punto" : "puntos"}` : ""}</span></figcaption>
    </figure>)}
  </div>;
}
