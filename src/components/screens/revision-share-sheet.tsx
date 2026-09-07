"use client";

import { useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export function RevisionShareSheet({ casita, files, onClose }: {
  casita: string;
  files: File[];
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const canShare = typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files });

  const share = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSharing(true);
    setMessage("");
    try {
      await navigator.share({ files });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("No se pudo compartir. Puedes reintentar o descargar las fotos para adjuntarlas.");
      }
    } finally {
      inFlight.current = false;
      setSharing(false);
    }
  };

  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <BottomSheet open onClose={onClose} title="Compartir evidencias">
      <div className="revision-share-content">
        <p><strong>Casita {casita}: revisión guardada.</strong></p>
        <p>{canShare
          ? "Comparte las fotos por WhatsApp u otra app disponible en tu dispositivo. Tú eliges el destino y los destinatarios."
          : "Este navegador no permite compartir archivos directamente. Descarga las fotos y adjúntalas en WhatsApp o en la app que prefieras."}</p>
        {canShare && <button type="button" className="primary-button" disabled={sharing} onClick={() => void share()}><Share2 size={18} aria-hidden="true" />{sharing ? "Abriendo opciones…" : `Compartir ${files.length === 1 ? "foto" : `${files.length} fotos`}`}</button>}
        <div className="revision-share-downloads">
          {files.map((file, index) => <button key={file.name} type="button" className="secondary-button" disabled={sharing} onClick={() => download(file)}><Download size={17} aria-hidden="true" />Descargar foto {index + 1}</button>)}
        </div>
        <p role="status">{message}</p>
        <button type="button" className="secondary-button" onClick={onClose}>Continuar</button>
      </div>
    </BottomSheet>
  );
}
