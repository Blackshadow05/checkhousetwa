"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileCheck2, FileDown, Share2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { pantallaTime, type PantallaReport } from "@/lib/pantallas";
import styles from "./pantalla-pdf-sheet.module.css";

export function PantallaPdfSheet({ reports, onClose }: {
  reports: PantallaReport[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(reports.map(report => report.id)));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const shareInFlight = useRef(false);
  const mounted = useRef(false);
  const readyHeading = useRef<HTMLHeadingElement>(null);
  const selectedReports = reports.filter(report => selected.has(report.id));
  const allSelected = selectedReports.length === reports.length;
  const canShare = !!file && typeof navigator !== "undefined"
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => { if (file) readyHeading.current?.focus(); }, [file]);

  function close() {
    controller.current?.abort();
    onClose();
  }

  async function generate() {
    if (controller.current || !selectedReports.length) return;
    const task = new AbortController();
    controller.current = task;
    setBusy(true);
    setError("");
    setMessage("");
    setProgress("Preparando PDF…");
    let generatorLoaded = false;
    try {
      const { createPantallasPdf } = await import("@/lib/pantallas-pdf");
      generatorLoaded = true;
      if (task.signal.aborted) return;
      const result = await createPantallasPdf(selectedReports, {
        signal: task.signal,
        onProgress: text => { if (mounted.current && !task.signal.aborted) setProgress(text); },
      });
      if (mounted.current && !task.signal.aborted) setFile(result);
    } catch (cause) {
      if (mounted.current && !task.signal.aborted) {
        setError(generatorLoaded && cause instanceof Error ? cause.message : "No se pudo crear el PDF. Revisa la conexión y vuelve a intentarlo.");
      }
    } finally {
      if (controller.current === task) controller.current = null;
      if (mounted.current && !task.signal.aborted) { setBusy(false); setProgress(""); }
    }
  }

  async function share() {
    if (!file || shareInFlight.current) return;
    shareInFlight.current = true;
    setSharing(true);
    setError("");
    setMessage("");
    try {
      // The file is already prepared: keep the system picker in the tap's user activation.
      await navigator.share({ files: [file] });
    } catch (cause) {
      if (mounted.current && !(cause instanceof Error && cause.name === "AbortError")) {
        setError("No se pudieron abrir las opciones. Puedes reintentar o descargar el PDF.");
      }
    } finally {
      shareInFlight.current = false;
      if (mounted.current) setSharing(false);
    }
  }

  function download() {
    if (!file || sharing) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    try {
      link.click();
      setError("");
      setMessage("Descarga iniciada. Si se abre una vista previa, usa sus opciones para guardar el PDF.");
    } finally {
      link.remove();
      // Give mobile download managers time to consume the URL, even if this panel closes.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  return <BottomSheet open onClose={close} title={file ? "PDF preparado" : "Crear PDF"}>
    <div className={styles.content}>
      {file ? <>
        <div className={styles.ready}>
          <FileCheck2 size={28} aria-hidden="true" />
          <h3 ref={readyHeading} tabIndex={-1}>Tu PDF está listo</h3>
          <p>{selectedReports.length} {selectedReports.length === 1 ? "reporte seleccionado" : "reportes seleccionados"}</p>
          <p className={styles.filename}>{file.name}</p>
        </div>
        <p className={styles.description}>{canShare
          ? "Abre las opciones del móvil y elige dónde guardar el PDF. En iPhone, selecciona Guardar en Archivos."
          : "Descarga el PDF para guardarlo en tu dispositivo."}</p>
        <div className={styles.actions}>
          {canShare && <button type="button" className={styles.primary} disabled={sharing} onClick={() => void share()}><Share2 size={19} aria-hidden="true" />{sharing ? "Abriendo opciones…" : "Guardar / compartir PDF"}</button>}
          <button type="button" className={canShare ? styles.secondary : styles.primary} disabled={sharing} onClick={download}><Download size={19} aria-hidden="true" />Descargar PDF</button>
          <button type="button" className={styles.secondary} disabled={sharing} onClick={() => { setFile(null); setError(""); setMessage(""); }}>Cambiar selección</button>
        </div>
      </> : <>
        <p className={styles.description}>Elige las casitas de esta búsqueda. Se incluye solo el último reporte de cada una, ordenadas de menor a mayor, con hasta 5 por hoja. Las notas largas irán completas al final.</p>
        <div className={styles.toolbar}>
          <strong role="status">{selectedReports.length} de {reports.length} seleccionados</strong>
          <button type="button" className={styles.secondary} disabled={busy || !reports.length} onClick={() => { setSelected(new Set(allSelected ? [] : reports.map(report => report.id))); setError(""); }}>{allSelected ? "Quitar todos" : "Seleccionar todos"}</button>
        </div>
        <fieldset className={styles.selection} disabled={busy}>
          <legend className={styles.legend}>Reportes que se incluirán en el PDF</legend>
          {reports.map(report => <label className={styles.report} key={report.id}>
            <input className={styles.checkbox} type="checkbox" checked={selected.has(report.id)} onChange={() => {
              setSelected(previous => { const next = new Set(previous); if (next.has(report.id)) next.delete(report.id); else next.add(report.id); return next; });
              setError("");
            }} />
            <span className={styles.reportText}>
              <span className={styles.reportTitle}><strong>Casita {report.numero_casita}</strong><span>#{report.id}</span></span>
              <span>{pantallaTime(report.fecha_hora)} · {report.nombre_usuario}</span>
              <span>{report.fotos.length} {report.fotos.length === 1 ? "foto" : "fotos"} · {report.fotos.map(photo => photo.ubicacion).join(", ")}</span>
            </span>
          </label>)}
        </fieldset>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={busy || !selectedReports.length} onClick={() => void generate()}><FileDown size={19} aria-hidden="true" />{busy ? "Creando PDF…" : `Crear PDF (${selectedReports.length})`}</button>
          {busy && <button type="button" className={styles.secondary} onClick={close}>Cancelar</button>}
        </div>
      </>}
      <p role="status" aria-live="polite" className={styles.status}>{progress || message}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </BottomSheet>;
}
