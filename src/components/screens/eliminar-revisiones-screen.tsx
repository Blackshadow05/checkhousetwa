"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, History, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { eliminarRevisiones, fetchRegistrosEliminados, fetchRevisionesParaEliminar } from "@/app/actions/eliminar-revisiones";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { DELETE_BATCH_SIZE, deletionHistoryDate, deletionRevisionDate, type DeleteHistoryCursor, type RegistroEliminado, type RevisionDeleteCursor, type RevisionParaEliminar } from "@/lib/eliminar-revisiones";
import { useOnline } from "@/lib/use-online";
import { casitaNumber } from "@/lib/revisiones-display";
import styles from "./eliminar-revisiones-screen.module.css";

export function EliminarRevisionesFeature({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="pantalla-feature" onClick={onOpen}>
    <span className="pantalla-feature-icon"><Trash2 size={27} aria-hidden /></span>
    <span><strong>Eliminar revisiones</strong><small>Selección e historial de eliminaciones</small></span>
    <ArrowRight size={21} aria-hidden />
  </button>;
}

export function EliminarRevisionesScreen({ visible, onBack }: { visible: boolean; onBack: () => void }) {
  const online = useOnline();
  const [tab, setTab] = useState<"revisiones" | "historial">("revisiones");
  const [rows, setRows] = useState<RevisionParaEliminar[]>([]);
  const [next, setNext] = useState<RevisionDeleteCursor | null>(null);
  const [logs, setLogs] = useState<RegistroEliminado[]>([]);
  const [nextLog, setNextLog] = useState<DeleteHistoryCursor | null>(null);
  const [loaded, setLoaded] = useState(false); const [logsLoaded, setLogsLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false); const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ids: string[]; stage: "warning" | "code" } | null>(null);
  const [code, setCode] = useState(""); const [codeError, setCodeError] = useState("");
  const requestBusy = useRef(false); const deleteBusy = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const batchSelected = batchIds.some(id => selectedSet.has(id));
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return rows.filter(row => !term || `${row.casita} ${row.quien_revisa} ${row.id} ${row.caja_fuerte || ""}`.toLocaleLowerCase("es").includes(term));
  }, [rows, search]);

  const rejectAccess = useCallback(() => {
    setDenied(true); setRows([]); setLogs([]); setSelected([]); setBatchIds([]); setConfirmation(null); setCode("");
  }, []);
  const loadRows = useCallback(async (mode: "refresh" | "more" | "batch", cursor: RevisionDeleteCursor | null = null) => {
    if (requestBusy.current || deleteBusy.current || !navigator.onLine) return;
    requestBusy.current = true; setLoading(true); setError("");
    try {
      const result = await fetchRevisionesParaEliminar(cursor, mode === "batch");
      if (result.denied) { rejectAccess(); setError(result.error || "Acceso restringido."); return; }
      if (result.error) { setError(result.error); return; }
      setRows(previous => mode === "more" ? [...previous, ...result.rows.filter(row => !previous.some(item => item.id === row.id))] : result.rows);
      setNext(result.nextCursor); setLoaded(true);
      if (mode !== "more") {
        setSelected(mode === "batch" ? result.rows.map(row => row.id) : []);
        setBatchIds(mode === "batch" ? result.rows.map(row => row.id) : []);
        if (mode === "batch") { setSearch(""); setNotice(`Seleccionadas las ${result.rows.length} revisiones más recientes. Puedes desmarcar las que quieras conservar.`); }
      }
    } catch { setError("No se pudo actualizar la lista. Conservamos lo ya cargado."); }
    finally { requestBusy.current = false; setLoading(false); }
  }, [rejectAccess]);
  const loadLogs = useCallback(async (cursor: DeleteHistoryCursor | null = null) => {
    if (requestBusy.current || deleteBusy.current || !navigator.onLine) return;
    requestBusy.current = true; setLoading(true); setError("");
    try {
      const result = await fetchRegistrosEliminados(cursor);
      if (result.denied) { rejectAccess(); setError(result.error || "Acceso restringido."); return; }
      if (result.error) { setError(result.error); return; }
      setLogs(previous => cursor ? [...previous, ...result.rows.filter(row => !previous.some(item => item.id === row.id))] : result.rows);
      setNextLog(result.nextCursor); setLogsLoaded(true);
    } catch { setError("No se pudo actualizar el historial. Conservamos lo ya cargado."); }
    finally { requestBusy.current = false; setLoading(false); }
  }, [rejectAccess]);

  useEffect(() => {
    if (!visible || !online || denied) return;
    const timer = window.setTimeout(() => {
      if (tab === "revisiones" && !loaded) void loadRows("refresh");
      if (tab === "historial" && !logsLoaded) void loadLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [visible, online, denied, tab, loaded, logsLoaded, loadRows, loadLogs]);
  useEffect(() => {
    if (confirmation?.stage !== "code" || !visible) return;
    const frame = requestAnimationFrame(() => codeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmation?.stage, visible]);
  // Never retain a code or leave a modal open when navigating away.
  if (!visible && confirmation && !deleting) { setConfirmation(null); setCode(""); setCodeError(""); }

  const close = () => { if (!deleteBusy.current) { setConfirmation(null); setCode(""); setCodeError(""); } };
  const submit = async () => {
    if (!confirmation || confirmation.stage !== "code" || deleteBusy.current || !navigator.onLine || !/^\d{6}$/.test(code)) return;
    deleteBusy.current = true; setDeleting(true); setCodeError("");
    const ids = confirmation.ids;
    const currentCode = code; setCode("");
    try {
      const result = await eliminarRevisiones(ids, currentCode);
      if (result.denied) { rejectAccess(); setError(result.error || "Acceso restringido."); return; }
      if (result.error || !result.registro) { setCodeError(result.error || "No se pudo confirmar la eliminación."); return; }
      const deleted = new Set(ids);
      setRows(previous => previous.filter(row => !deleted.has(row.id)));
      setSelected([]); setBatchIds([]); setConfirmation(null); setError("");
      setLogs(previous => [result.registro!, ...previous.filter(row => row.id !== result.registro!.id)]);
      setNotice(`${result.registro.cantidad} ${result.registro.cantidad === 1 ? "revisión eliminada" : "revisiones eliminadas"}. La operación quedó registrada en el historial.`);
      window.dispatchEvent(new CustomEvent("casitas:revisiones-eliminadas", { detail: ids }));
    } catch { setCodeError("No se pudo confirmar el resultado. Actualiza el historial antes de reintentar."); }
    finally { deleteBusy.current = false; setDeleting(false); }
  };

  const blocked = loading || deleting || !online || denied;
  return <section className={styles.screen} aria-label="Eliminar revisiones">
    <button type="button" className={styles.back} disabled={deleting} onClick={onBack}><ArrowLeft size={18} aria-hidden />Otros</button>
    <div className={styles.header}><div><h1>Eliminar revisiones</h1><p className={styles.muted}><ShieldCheck size={14} aria-hidden />Solo SuperAdmin</p></div>
      <button type="button" className={styles.icon} aria-label={tab === "revisiones" ? "Actualizar revisiones y limpiar selección" : "Actualizar historial"} disabled={blocked} onClick={() => tab === "revisiones" ? void loadRows("refresh") : void loadLogs()}><RefreshCw size={20} aria-hidden /></button>
    </div>
    <div className={styles.tabs} aria-label="Vista de eliminaciones"><button type="button" disabled={loading || deleting} aria-pressed={tab === "revisiones"} onClick={() => { setTab("revisiones"); setError(""); }}>Revisiones</button><button type="button" disabled={loading || deleting} aria-pressed={tab === "historial"} onClick={() => { setTab("historial"); setError(""); }}><History size={17} aria-hidden />Historial</button></div>
    {!online && <p className={styles.notice} role="status">Sin conexión. Conservamos los datos de esta pantalla; conéctate para actualizar o eliminar.</p>}
    {error && <p className={styles.notice} role="alert">{error}</p>}
    {notice && <p className={styles.muted} role="status">{notice}</p>}
    {!denied && tab === "revisiones" && <>
      <p className={styles.muted}>Selecciona registros individuales o las 200 revisiones más recientes por fecha. Máximo 200 por operación.</p>
      <div className={styles.actions}><button type="button" className={styles.batch} aria-pressed={batchSelected} disabled={loading || deleting || denied || (!online && !batchSelected)} onClick={() => {
        if (batchSelected) { setSelected(previous => previous.filter(id => !batchIds.includes(id))); setBatchIds([]); setNotice(""); }
        else void loadRows("batch");
      }}>{batchSelected ? "Deseleccionar últimos 200" : "Seleccionar últimos 200"}</button></div>
      <label className={styles.search}>Filtrar registros cargados<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Casita, usuario, estado o ID" /></label>
      <div className={styles.selection}><span role="status">{selected.length} {selected.length === 1 ? "seleccionada" : "seleccionadas"}</span><button type="button" className={styles.danger} disabled={blocked || !selected.length} onClick={() => { setConfirmation({ ids: [...selected], stage: "warning" }); setCode(""); setCodeError(""); }}><Trash2 size={17} aria-hidden />Eliminar</button></div>
      {loading && !loaded && <div className={styles.skeleton} aria-label="Cargando revisiones" aria-busy="true" />}
      {loaded && !filtered.length && <div className={styles.empty}><h2>{rows.length ? "No hay coincidencias" : "No hay revisiones"}</h2><p>{rows.length ? "Prueba otro filtro. La selección se conserva." : "Las nuevas revisiones aparecerán aquí."}</p></div>}
      <ul className={styles.list}>{filtered.map(row => <li key={row.id}><label className={`${styles.card} ${selectedSet.has(row.id) ? styles.checked : ""}`}>
        <input type="checkbox" checked={selectedSet.has(row.id)} disabled={deleting || denied || !online || (!selectedSet.has(row.id) && selected.length >= DELETE_BATCH_SIZE)} onChange={e => { setNotice(""); setSelected(previous => e.target.checked ? previous.includes(row.id) || previous.length >= DELETE_BATCH_SIZE ? previous : [...previous, row.id] : previous.filter(id => id !== row.id)); }} aria-label={`Seleccionar casita ${row.casita}, ${deletionRevisionDate(row.created_at)}, ${row.quien_revisa}, registro ${row.id}`} />
        <span className={styles.record}><strong>Casita {casitaNumber(row.casita)}</strong><span>{row.quien_revisa} · {row.caja_fuerte || "Sin estado"}</span><time dateTime={row.created_at?.replace(" ", "T")}>{deletionRevisionDate(row.created_at)}</time><small>ID {row.id}</small></span>
      </label></li>)}</ul>
      {next && <button type="button" className={styles.more} disabled={blocked} onClick={() => void loadRows("more", next)}>Ver revisiones anteriores</button>}
    </>}
    {!denied && tab === "historial" && <>
      <p className={styles.muted}>Fecha y hora de Costa Rica. Cada operación muestra quién eliminó, su IP y la cantidad de revisiones.</p>
      {loading && !logsLoaded && <div className={styles.skeleton} aria-label="Cargando historial" aria-busy="true" />}
      {logsLoaded && !logs.length && <div className={styles.empty}><History size={28} aria-hidden /><h2>Aún no hay eliminaciones</h2><p>Las operaciones confirmadas aparecerán aquí.</p></div>}
      <ul className={styles.list}>{logs.map(log => <li key={log.id} className={styles.log}><div><strong>{log.usuario}</strong><span className={styles.count}>{log.cantidad} {log.cantidad === 1 ? "revisión" : "revisiones"}</span></div><time dateTime={log.fecha}>{deletionHistoryDate(log.fecha)}</time><p>IP: {log.ip || "No disponible"}</p></li>)}</ul>
      {nextLog && <button type="button" className={styles.more} disabled={blocked} onClick={() => void loadLogs(nextLog)}>Ver eliminaciones anteriores</button>}
    </>}
    <BottomSheet open={visible && !!confirmation} title={confirmation?.stage === "code" ? "Verifica tu identidad" : "Confirmar eliminación"} onClose={close}>
      {confirmation?.stage === "warning" ? <div className={styles.confirm}>
        <p role="alert">Vas a eliminar permanentemente {confirmation.ids.length} {confirmation.ids.length === 1 ? "revisión" : "revisiones"} y sus notas asociadas. Esta acción no se puede deshacer.</p>
        <p>Si continúas, pediremos un código nuevo de tu Authenticator.</p>
        <button type="button" className={styles.danger} disabled={!online} onClick={() => setConfirmation({ ...confirmation, stage: "code" })}>Continuar</button><button type="button" onClick={close}>Cancelar</button>
      </div> : <form className={styles.confirm} onSubmit={e => { e.preventDefault(); void submit(); }}>
        <p>Confirma la eliminación de {confirmation?.ids.length} {confirmation?.ids.length === 1 ? "revisión" : "revisiones"} con el código de tu cuenta.</p>
        <label>Código de Authenticator<input ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} disabled={deleting} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-describedby={codeError ? "delete-code-error" : undefined} aria-invalid={!!codeError} required /></label>
        {codeError && <p id="delete-code-error" role="alert">{codeError}</p>}
        {!online && <p role="status">Conéctate para verificar el código y eliminar.</p>}
        <button type="submit" className={styles.danger} disabled={deleting || !online || code.length !== 6}>{deleting ? "Verificando y eliminando…" : "Verificar y eliminar"}</button><button type="button" disabled={deleting} onClick={close}>Cancelar</button>
      </form>}
    </BottomSheet>
  </section>;
}
