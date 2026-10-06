"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import type { SlideData } from "photoswipe";
import "photoswipe/style.css";
import {
  cloudinaryPreviewUrl,
  cloudinaryUrl,
  cloudinaryViewerUrl,
} from "@/lib/cloudinary";
import { evidenceFileName, evidencePathMark } from "@/lib/revision-evidence";

type EvidenceGalleryProps = {
  paths: string[];
  casita: string;
};

type ImageSize = {
  width: number;
  height: number;
};

const FALLBACK_SIZE: ImageSize = { width: 1600, height: 1200 };
const sizeCache = new Map<string, ImageSize>();

const SHARE_ICON = `<svg class="pswp__icn" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`;

const DOWNLOAD_ICON = '<svg class="pswp__icn" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5v15m-6-6 6 6 6-6M7 22v5h18v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif" };
let downloading = false;
const originalCache = new Map<string, Promise<Blob>>();

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function fetchOriginal(path: string) {
  const cached = originalCache.get(path);
  if (cached) return cached;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const request = fetch(cloudinaryUrl(path, ""), { signal: controller.signal })
    .then((response) => {
      if (!response.ok) throw new Error("download");
      return response.blob();
    })
    .finally(() => window.clearTimeout(timeout));
  originalCache.set(path, request);
  request.catch(() => originalCache.delete(path));
  if (originalCache.size > 12) originalCache.delete(originalCache.keys().next().value!);
  return request;
}

function prefetchOriginal(path: string | undefined) {
  if (!path || !isAppleMobile()) return;
  fetchOriginal(path).catch(() => undefined);
}

async function downloadSlide(
  path: string | undefined,
  index: number,
  casita: string,
  statusEl: HTMLElement | null,
) {
  if (!path || downloading) return;
  const setStatus = (message: string) => {
    if (statusEl) statusEl.textContent = message;
  };
  downloading = true;
  setStatus("Preparando descarga…");
  try {
    const blob = await fetchOriginal(path);
    const name = evidenceFileName(casita, index, EXTENSIONS[blob.type] ?? "jpg", evidencePathMark(path));
    if (isAppleMobile() && typeof navigator.share === "function") {
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        setStatus("Toca «Guardar imagen» para guardarla en Fotos.");
        try {
          await navigator.share({ files: [file] });
          setStatus("");
        } catch (error) {
          setStatus(error instanceof DOMException && error.name === "AbortError" ? "" : "No se pudo abrir el guardado. Vuelve a tocar descargar.");
        }
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus("Descarga iniciada.");
  } catch {
    setStatus("No se pudo descargar la foto. Revisa la conexión y vuelve a intentarlo.");
  } finally {
    downloading = false;
  }
}

function loadImageSize(src: string) {
  const cached = sizeCache.get(src);
  if (cached) return Promise.resolve({ src, ...cached });
  return new Promise<{ src: string } & ImageSize>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const size: ImageSize = {
        width: image.naturalWidth || FALLBACK_SIZE.width,
        height: image.naturalHeight || FALLBACK_SIZE.height,
      };
      sizeCache.set(src, size);
      resolve({ src, ...size });
    };
    image.onerror = () => resolve({ src, ...FALLBACK_SIZE });
    image.src = src;
  });
}

function safeArea(side: "top" | "right" | "bottom" | "left") {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;padding-${side}:env(safe-area-inset-${side},0px)`;
  document.body.append(probe);
  const styles = getComputedStyle(probe);
  const value =
    Number.parseFloat(
      {
        top: styles.paddingTop,
        right: styles.paddingRight,
        bottom: styles.paddingBottom,
        left: styles.paddingLeft,
      }[side],
    ) || 0;
  probe.remove();
  return value;
}

async function shareSlide(
  path: string | undefined,
  index: number,
  casita: string,
  statusEl: HTMLElement | null,
) {
  if (!path) return;
  const setStatus = (message: string) => {
    if (statusEl) statusEl.textContent = message;
  };
  if (typeof navigator.share !== "function") {
    setStatus("Compartir no está disponible en este dispositivo.");
    return;
  }
  const url = cloudinaryViewerUrl(path);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("share");
    const blob = await response.blob();
    const file = new File(
      [blob],
      evidenceFileName(casita, index, EXTENSIONS[blob.type] ?? "jpg", evidencePathMark(path)),
      { type: blob.type || "image/jpeg" },
    );
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Evidencia ${index + 1} · Casita ${casita}`,
      });
      setStatus("");
      return;
    }
    await navigator.share({
      title: `Evidencia ${index + 1} · Casita ${casita}`,
      url,
    });
    setStatus("");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    setStatus("No se pudo compartir ahora.");
  }
}

function useActiveSlide(length: number) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || length === 0) return;
    const slides = [...track.children];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const next = slides.indexOf(visible.target);
        if (next >= 0) setIndex(next);
      },
      { root: track, threshold: 0.55 },
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, [length]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(length - 1, next));
      setIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches;
      track.scrollTo({
        left: track.clientWidth * clamped,
        behavior: reduce ? "auto" : "smooth",
      });
    },
    [length],
  );

  return { trackRef, index, goTo };
}

export function EvidenceGallery({ paths, casita }: EvidenceGalleryProps) {
  const { trackRef, index, goTo } = useActiveSlide(paths.length);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);
  const pathsRef = useRef(paths);
  const casitaRef = useRef(casita);
  const openingRef = useRef(false);

  useEffect(() => {
    pathsRef.current = paths;
    casitaRef.current = casita;
  }, [paths, casita]);

  const pathsKey = paths.join("|");

  useEffect(() => {
    for (const path of paths) {
      void loadImageSize(cloudinaryViewerUrl(path));
    }
  }, [paths, pathsKey]);

  useEffect(() => {
    const lightbox = new PhotoSwipeLightbox({
      pswpModule: () => import("photoswipe"),
      bgOpacity: 1,
      showHideAnimationType: "fade",
      wheelToZoom: true,
      mainClass: "evidence-pswp",
      closeTitle: "Cerrar",
      zoomTitle: "Ampliar",
      arrowPrevTitle: "Evidencia anterior",
      arrowNextTitle: "Evidencia siguiente",
      indexIndicatorSep: " de ",
      errorMsg: "No se pudo cargar la imagen.",
      paddingFn: () => ({
        top: 60 + safeArea("top"),
        bottom: 40 + safeArea("bottom"),
        left: safeArea("left"),
        right: safeArea("right"),
      }),
    });
    lightbox.on("uiRegister", () => {
      const pswp = lightbox.pswp;
      if (!pswp?.ui) return;
      pswp.ui.registerElement({
        name: "share-status",
        order: 8,
        appendTo: "root",
        onInit: (element) => {
          element.className = "evidence-pswp-status";
          element.setAttribute("role", "status");
        },
      });
      pswp.ui.registerElement({
        name: "download-button",
        order: 9,
        isButton: true,
        title: "Descargar evidencia",
        ariaLabel: "Descargar evidencia",
        html: DOWNLOAD_ICON,
        onClick: (_event, _element, instance) => {
          const current = instance.currIndex;
          void downloadSlide(
            pathsRef.current[current],
            current,
            casitaRef.current,
            instance.element?.querySelector<HTMLElement>(".evidence-pswp-status") ?? null,
          );
        },
      });
      pswp.ui.registerElement({
        name: "share-button",
        order: 9,
        isButton: true,
        title: "Compartir evidencia",
        ariaLabel: "Compartir evidencia",
        html: SHARE_ICON,
        onClick: (_event, _element, instance) => {
          const current = instance.currIndex;
          const status = instance.element?.querySelector<HTMLElement>(
            ".evidence-pswp-status",
          );
          void shareSlide(
            pathsRef.current[current],
            current,
            casitaRef.current,
            status ?? null,
          );
        },
      });
    });
    const prefetchCurrent = () => {
      const current = lightbox.pswp?.currIndex;
      if (current !== undefined) prefetchOriginal(pathsRef.current[current]);
    };
    lightbox.on("afterInit", prefetchCurrent);
    lightbox.on("change", prefetchCurrent);
    lightbox.init();
    lightboxRef.current = lightbox;
    return () => {
      lightbox.destroy();
      lightboxRef.current = null;
    };
  }, []);

  const openViewer = async (next: number, point: { x: number; y: number }) => {
    const lightbox = lightboxRef.current;
    if (!lightbox || openingRef.current || lightbox.pswp) return;
    openingRef.current = true;
    try {
      const dataSource: SlideData[] = await Promise.all(
        pathsRef.current.map(async (path, slideIndex) => {
          const src = cloudinaryViewerUrl(path);
          const sized = await loadImageSize(src);
          return {
            src: sized.src,
            width: sized.width,
            height: sized.height,
            alt: `Evidencia ${slideIndex + 1} de casita ${casitaRef.current}`,
            msrc: cloudinaryPreviewUrl(path),
          };
        }),
      );
      lightbox.loadAndOpen(next, dataSource, point);
    } finally {
      openingRef.current = false;
    }
  };

  const onSlidePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onSlideClick = (event: MouseEvent<HTMLButtonElement>, next: number) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
    ) {
      event.preventDefault();
      return;
    }
    void openViewer(next, { x: event.clientX, y: event.clientY });
  };

  if (paths.length === 0) return null;

  return (
    <div className="evidence-header">
      <div
        ref={trackRef}
        className="evidence-track"
        aria-roledescription="carrusel"
        aria-label="Evidencias de la revisión"
      >
        {paths.map((path, slideIndex) => (
          <button
            key={`${path}-${slideIndex}`}
            type="button"
            className="evidence-slide"
            onPointerDown={onSlidePointerDown}
            onClick={(event) => onSlideClick(event, slideIndex)}
            aria-label={`Ver evidencia ${slideIndex + 1} de ${paths.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cloudinaryPreviewUrl(path)}
              alt=""
              decoding="async"
              fetchPriority={slideIndex === 0 ? "high" : "low"}
            />
          </button>
        ))}
      </div>
      {paths.length > 1 && (
        <>
          <div className="evidence-dots">
            {paths.map((path, slideIndex) => (
              <button
                key={`${path}-dot`}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={slideIndex === index ? "is-active" : ""}
                onClick={() => goTo(slideIndex)}
              />
            ))}
          </div>
          <span className="evidence-count">
            {index + 1}/{paths.length}
          </span>
        </>
      )}
    </div>
  );
}
