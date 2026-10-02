"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Download, FileSpreadsheet, House, LoaderCircle, WifiOff } from "lucide-react";
import { fetchReporteRevision } from "@/app/actions/reportes";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { nombreArchivoReporteRevision, reporteRevisionDateRange, todayReporteRevision } from "@/lib/reportes-revision";
import { shiftDay } from "@/lib/revisiones-archive";
import { useOnline } from "@/lib/use-online";
import styles from "./reportes-screen.module.css";

type SavedReport = {
  id: string;
  desde: string;
  hasta: string;
  csv: string;
  count: number;
  generatedAt: string;
};
type ReadyReport = SavedReport & { url: string; cached: boolean };

function readyReport(saved: SavedReport, cached: boolean): ReadyReport {
  return { ...saved, cached, url: URL.createObjectURL(new Blob([saved.csv], { type: "text/csv;charset=utf-8" })) };
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportesScreen({ path, visible, usuarioId, navigate }: {
  path: string;
  visible: boolean;
  usuarioId: number;
  navigate: (path: string) => void;
}) {
  const isRevision = path === "/reportes/revision-casitas";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (visible) heading.current?.focus({ preventScroll: true });
  }, [path, visible]);

  return <div className={styles.screen}>
    <div hidden={isRevision}>
      <button type="button" className={styles.back} onClick={() => navigate("/otros")}><ArrowLeft size={18} aria-hidden />Otros</button>
      <h1 ref={!isRevision ? heading : undefined} tabIndex={-1}>Reportes</h1>
      <button type="button" className={styles.reportCard} onClick={() => navigate("/reportes/revision-casitas")}>
        <span className={styles.icon}><House size={25} aria-hidden /></span>
        <span className={styles.reportName}><strong>Revisión de casitas</strong><small>CSV por fechas</small></span>
        <ArrowRight size={20} aria-hidden />
      </button>
    </div>
    <div hidden={!isRevision}>
      <button type="button" className={styles.back} onClick={() => navigate("/reportes")}><ArrowLeft size={18} aria-hidden />Reportes</button>
      <div className={styles.heading}><h1 ref={isRevision ? heading : undefined} tabIndex={-1}>Revisión de casitas</h1><span className={styles.format}>CSV</span></div>
      <RevisionReport usuarioId={usuarioId} />
    </div>
  </div>;
}

function RevisionReport({ usuarioId }: { usuarioId: number }) {
  const [desde, setDesde] = useState(() => todayReporteRevision());
  const [hasta, setHasta] = useState(() => todayReporteRevision());
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>("Hoy");
  const touched = useRef(false);
  const preparing = useRef(false);
  const online = useOnline();
  const storageKey = `reporte-revision-v1:${usuarioId}`;
  const rangeError = reporteRevisionDateRange({ desde, hasta }).error;
  const today = todayReporteRevision();
  const presets = [
    { label: "Hoy", desde: today, hasta: today },
    { label: "Últimos 7 días", desde: shiftDay(today, -6), hasta: today },
    { label: "Último mes", desde: shiftDay(today, -29), hasta: today },
  ];

  useEffect(() => {
    let live = true;
    void idbGet<SavedReport>(IDB_STORES.snapshots, storageKey).then(saved => {
      if (!live || !saved || preparing.current || touched.current) return;
      if (typeof saved.csv !== "string" || !Number.isSafeInteger(saved.count) || saved.count < 0 || reporteRevisionDateRange(saved).error) return;
      setReport(readyReport(saved, true));
      setDesde(saved.desde);
      setHasta(saved.hasta);
      setSelectedPreset(null);
    }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!report) return;
    return () => URL.revokeObjectURL(report.url);
  }, [report]);

  const changeDates = (start: string, end: string, preset: string | null = null) => {
    touched.current = true;
    setDesde(start); setHasta(end); setError(""); setNotice("");
    setSelectedPreset(preset);
  };
  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preparing.current || rangeError || !online) return;
    preparing.current = true;
    touched.current = true;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await fetchReporteRevision({ desde, hasta });
      if (result.error || result.csv === null) {
        setError(result.error || "No se pudo crear el CSV. Vuelve a intentarlo.");
        return;
      }
      const saved: SavedReport = { id: storageKey, desde, hasta, csv: result.csv, count: result.count, generatedAt: new Date().toISOString() };
      setReport(readyReport(saved, false));
      await idbPut(IDB_STORES.snapshots, saved).catch(() => setNotice("Archivo listo. No se pudo guardar en este dispositivo."));
    } catch {
      setError("No se pudo crear el CSV. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      preparing.current = false;
      setLoading(false);
    }
  };

  return <>
    <form className={styles.form} onSubmit={event => void generate(event)} aria-busy={loading}>
      <div className={styles.sectionTitle}><CalendarDays size={18} aria-hidden /><h2>Rango de fechas</h2></div>
      <div className={styles.presets} aria-label="Rangos rápidos">{presets.map(preset => <button key={preset.label} type="button" disabled={loading} aria-pressed={selectedPreset === preset.label && desde === preset.desde && hasta === preset.hasta} onClick={() => changeDates(preset.desde, preset.hasta, preset.label)}>{preset.label}</button>)}</div>
      <div className={styles.dates}>
        <label>Desde<input type="date" required value={desde} disabled={loading} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "reporte-fechas-error" : undefined} onChange={event => changeDates(event.target.value, hasta)} /></label>
        <label>Hasta<input type="date" required value={hasta} disabled={loading} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "reporte-fechas-error" : undefined} onChange={event => changeDates(desde, event.target.value)} /></label>
      </div>
      {rangeError && <p id="reporte-fechas-error" role="alert" className={styles.error}>{rangeError}</p>}
      {!online && <p role="status" className={styles.offline}><WifiOff size={17} aria-hidden />Conéctate para crear un reporte.</p>}
      <button className={styles.primary} type="submit" disabled={loading || !online || Boolean(rangeError)}>{loading ? <LoaderCircle size={20} className={styles.spinner} aria-hidden /> : <FileSpreadsheet size={20} aria-hidden />}{loading ? "Creando CSV…" : "Crear CSV"}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.meta}>{notice}</p>}
    {loading && <div className={styles.progress} role="status">Consultando movimientos…<div className={styles.skeleton} /></div>}
    {report && <section className={styles.result} aria-label="Resultado del reporte">
      <div className={styles.resultHeading}><span className={styles.resultIcon}>{report.count ? <Check size={22} aria-hidden /> : <CalendarDays size={22} aria-hidden />}</span><div><h2>{report.count ? report.cached ? "CSV guardado" : "CSV listo" : "Sin movimientos"}</h2><p role="status">{report.count ? `${report.count.toLocaleString("es-CR")} ${report.count === 1 ? "movimiento" : "movimientos"}` : "Prueba otro rango de fechas."}</p></div></div>
      <p className={styles.range}>{dateLabel(report.desde)} — {dateLabel(report.hasta)}</p>
      {report.count > 0 && <a className={styles.download} href={report.url} download={nombreArchivoReporteRevision(report)}><Download size={20} aria-hidden />Descargar CSV</a>}
      {report.count > 0 && <p className={styles.meta}>{report.cached ? "Último reporte guardado" : online ? "Actualizado" : "Último reporte generado"} · {new Date(report.generatedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
    </section>}
  </>;
}
