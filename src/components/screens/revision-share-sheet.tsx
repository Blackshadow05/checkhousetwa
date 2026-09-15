"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck, ChevronDown, Download, LoaderCircle, Share2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";

function canShareFiles(files: File[]) {
  try {
    return files.length > 0 && typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files });
  } catch {
    return false;
  }
}

function EvidenceImage({ file, alt }: { file: File; alt: string }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Local files stay available even if the connection drops after saving.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} alt={alt} />;
}

function EvidenceDownload({ file, index, disabled }: { file: File; index: number; disabled: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (link.current) link.current.href = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <a ref={link} download={file.name} aria-disabled={disabled || undefined}
    onClick={event => { if (disabled) event.preventDefault(); }}
  ><Download size={16} aria-hidden="true" />Guardar evidencia {index + 1}</a>;
}

export function RevisionShareSheet({ casita, files, onClose }: {
  casita: string;
  files: File[];
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const canShare = canShareFiles(files);

  const share = async () => {
    if (inFlight.current || !files.length || !canShare) return;
    inFlight.current = true;
    setSharing(true);
    setMessage("");
    try {
      // Files are already local: call directly from the tap to retain user activation.
      await navigator.share({ files });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("No se pudo compartir. Reintenta o descarga las fotos.");
      }
    } finally {
      inFlight.current = false;
      setSharing(false);
    }
  };

  return (
    <BottomSheet open onClose={onClose} title="Compartir evidencias">
      <div className="revision-share-content">
        <div className="revision-share-saved">
          <span className="revision-share-success-icon"><CheckCheck size={25} strokeWidth={1.7} aria-hidden="true" /></span>
          <div><p>Revisión guardada</p><h3>Casita {casita}</h3></div>
        </div>
        <div className="revision-share-photos" aria-label="Evidencias de la revisión">
          {files.map((file, index) => {
            const preview = <>
              <span className="revision-share-image">
                <EvidenceImage file={file} alt={`Evidencia ${index + 1} de casita ${casita}`} />
              </span>
              <span className="revision-share-caption">Evidencia {index + 1}</span>
            </>;
            return <div className="revision-share-photo" key={file.name}>{preview}</div>;
          })}
        </div>
        <div className="revision-share-actions">
          {canShare && <>
            <button type="button" className="primary-button revision-share-submit" disabled={sharing || !files.length} onClick={() => void share()}>
              {sharing ? <LoaderCircle size={20} className="revision-spinner" aria-hidden="true" /> : <Share2 size={20} aria-hidden="true" />}
              {sharing ? "Abriendo opciones…" : "Compartir evidencias"}
            </button>
          </>}
          {message && <p className="revision-share-error" role="alert">{message}</p>}
          <details className="revision-share-downloads" open={!canShare || Boolean(message)}>
            <summary><Download size={16} aria-hidden="true" /> Descargar evidencias <ChevronDown size={16} aria-hidden="true" /></summary>
            <div>{files.map((file, index) => <EvidenceDownload key={file.name} file={file} index={index} disabled={sharing} />)}</div>
          </details>
          <button type="button" className="revision-share-done" onClick={onClose}>Listo</button>
        </div>
      </div>
    </BottomSheet>
  );
}
