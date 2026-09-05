"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Share2, X } from "lucide-react";
import {
  cloudinaryPreviewUrl,
  cloudinaryViewerUrl,
} from "@/lib/cloudinary";

type EvidenceGalleryProps = {
  paths: string[];
  casita: string;
};

function useActiveSlide(length: number, enabled = true) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled) return;
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
  }, [length, enabled]);

  const goTo = useCallback(
    (next: number, instant = false) => {
      const clamped = Math.max(0, Math.min(length - 1, next));
      setIndex(clamped);
      const track = trackRef.current;
      if (!track) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches;
      track.scrollTo({
        left: track.clientWidth * clamped,
        behavior: instant || reduce ? "auto" : "smooth",
      });
    },
    [length],
  );

  return { trackRef, index, setIndex, goTo };
}

export function EvidenceGallery({ paths, casita }: EvidenceGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const {
    trackRef: carouselTrackRef,
    index: carouselIndex,
    goTo: goToCarousel,
  } = useActiveSlide(paths.length, true);
  const {
    trackRef: viewerTrackRef,
    index: viewerIndex,
    setIndex: setViewerIndex,
    goTo: goToViewer,
  } = useActiveSlide(paths.length, viewerOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const startIndex = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [shareMessage, setShareMessage] = useState("");

  useLayoutEffect(() => {
    if (!viewerOpen) return;
    closeRef.current?.focus();
    goToViewer(startIndex.current, true);
  }, [viewerOpen, goToViewer]);

  const openViewer = (next: number) => {
    startIndex.current = next;
    setViewerIndex(next);
    setShareMessage("");
    setViewerOpen(true);
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
    openViewer(next);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setShareMessage("");
  };

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      closeViewer();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [viewerOpen]);

  const onViewerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeViewer();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToViewer(Math.min(paths.length - 1, viewerIndex + 1));
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToViewer(Math.max(0, viewerIndex - 1));
    }
  };

  const shareCurrent = async () => {
    const path = paths[viewerIndex];
    if (!path) return;
    if (typeof navigator.share !== "function") {
      setShareMessage("Compartir no está disponible en este dispositivo.");
      return;
    }
    const url = cloudinaryViewerUrl(path);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("share");
      const blob = await response.blob();
      const file = new File(
        [blob],
        `casita-${casita}-evidencia-${viewerIndex + 1}.jpg`,
        { type: blob.type || "image/jpeg" },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Evidencia ${viewerIndex + 1} · Casita ${casita}`,
        });
        return;
      }
      await navigator.share({
        title: `Evidencia ${viewerIndex + 1} · Casita ${casita}`,
        url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("No se pudo compartir ahora.");
    }
  };

  if (paths.length === 0) return null;

  return (
    <>
      <div className="evidence-header">
        <div
          ref={carouselTrackRef}
          className="evidence-track"
          aria-roledescription="carrusel"
          aria-label="Evidencias de la revisión"
        >
          {paths.map((path, index) => (
            <button
              key={`${path}-${index}`}
              type="button"
              className="evidence-slide"
              onPointerDown={onSlidePointerDown}
              onClick={(event) => onSlideClick(event, index)}
              aria-label={`Ver evidencia ${index + 1} de ${paths.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cloudinaryPreviewUrl(path)}
                alt=""
                decoding="async"
                fetchPriority={index === 0 ? "high" : "low"}
              />
            </button>
          ))}
        </div>
        {paths.length > 1 && (
          <>
            <div className="evidence-dots">
              {paths.map((path, index) => (
                <button
                  key={`${path}-dot`}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className={index === carouselIndex ? "is-active" : ""}
                  onClick={() => goToCarousel(index)}
                />
              ))}
            </div>
            <span className="evidence-count">
              {carouselIndex + 1}/{paths.length}
            </span>
          </>
        )}
      </div>
      {viewerOpen &&
        createPortal(
          <div
            className="evidence-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Galería de evidencias"
            tabIndex={-1}
            onKeyDown={onViewerKey}
          >
            <div className="evidence-viewer-bar">
              <button
                ref={closeRef}
                type="button"
                className="icon-button evidence-viewer-close"
                aria-label="Cerrar galería"
                onClick={closeViewer}
              >
                <X size={22} />
              </button>
              <p>
                {viewerIndex + 1} de {paths.length}
              </p>
              <button
                type="button"
                className="icon-button"
                aria-label="Compartir evidencia"
                onClick={() => void shareCurrent()}
              >
                <Share2 size={20} />
              </button>
            </div>
            <div ref={viewerTrackRef} className="evidence-viewer-track">
              {paths.map((path, index) => (
                <div
                  key={`${path}-view`}
                  className="evidence-viewer-slide"
                  aria-hidden={index !== viewerIndex}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cloudinaryViewerUrl(path)}
                    alt={`Evidencia ${index + 1} de casita ${casita}`}
                    decoding="async"
                  />
                </div>
              ))}
            </div>
            {paths.length > 1 && (
              <>
                <button
                  type="button"
                  className="evidence-nav evidence-nav-prev"
                  aria-label="Evidencia anterior"
                  disabled={viewerIndex === 0}
                  onClick={() => goToViewer(viewerIndex - 1)}
                >
                  <ChevronLeft size={26} />
                </button>
                <button
                  type="button"
                  className="evidence-nav evidence-nav-next"
                  aria-label="Evidencia siguiente"
                  disabled={viewerIndex === paths.length - 1}
                  onClick={() => goToViewer(viewerIndex + 1)}
                >
                  <ChevronRight size={26} />
                </button>
              </>
            )}
            <p className="evidence-share-feedback" role="status">
              {shareMessage}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
