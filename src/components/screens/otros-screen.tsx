"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Monitor, Plus, RefreshCw, FileDown, Files } from "lucide-react";
import { fetchPantallas } from "@/app/actions/pantallas";
import { AdminUsuariosFeature, AdminUsuariosScreen } from "@/components/screens/admin-usuarios";
import { HorariosScreen } from "@/components/screens/horarios-screen";
import { ReportesScreen } from "@/components/screens/reportes-screen";
import { PantallaForm } from "@/components/screens/pantalla-form";
import { PantallaPhotoGallery } from "@/components/screens/pantalla-photo-gallery";
import { PantallaPdfSheet } from "@/components/screens/pantalla-pdf-sheet";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { UBICACIONES, inventarioPantallas, latestPantallaReports, movimientoLabel, pantallaTime, ubicacionLabel, type PantallaReport, type PantallaSnapshot } from "@/lib/pantallas";
import { useOnline } from "@/lib/use-online";
import { esRolAdmin } from "@/lib/usuarios-admin";
import type { UsuarioShell } from "@/types/database";

export function OtrosScreen({ active, session }: { active: boolean; session: UsuarioShell }) {
  const [path, setPath] = useState("/otros");
  const [snapshot, setSnapshot] = useState<PantallaSnapshot | null>(null);
  const [loading, setLoading] = useState(false); const fetching = useRef(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [cached, setCached] = useState(true); const [tab, setTab] = useState("historial");
  const [location, setLocation] = useState(""); const [type, setType] = useState("reporte"); const [search, setSearch] = useState("");
  const [formVisited, setFormVisited] = useState(false); const [formKey, setFormKey] = useState(0);
  const [pdfReports, setPdfReports] = useState<PantallaReport[] | null>(null);
  const [adminVisited, setAdminVisited] = useState(false);
  const [horariosVisited, setHorariosVisited] = useState(false);
  const [reportesVisited, setReportesVisited] = useState(false);
  if (pdfReports && (!active || path !== "/reporte-pantallas")) setPdfReports(null);
  const online = useOnline();
  const esAdmin = esRolAdmin(session.rol);
  const listRef = useRef<HTMLDivElement>(null); const adminRef = useRef<HTMLDivElement>(null); const horariosRef = useRef<HTMLDivElement>(null); const reportesRef = useRef<HTMLDivElement>(null);
  const scrollMemory = useRef<Record<string, number>>({});
  const lastPath = useRef("/otros");
  const scrollKey = (target: string) => (target.startsWith("/admin-usuarios/") ? "/admin-usuarios" : target);
  const scrollerFor = (target: string) => (target.startsWith("/reportes") ? reportesRef : target === "/horarios" ? horariosRef : target.startsWith("/admin-usuarios") ? adminRef : listRef).current?.closest<HTMLElement>(".app-screen") ?? null;
  useEffect(() => {
    const sync = () => {
      const next = window.location.pathname.replace(/\/$/, "") || "/";
      const fromHorarios = lastPath.current === "/horarios";
      const fromReportes = lastPath.current.startsWith("/reportes");
      if (fromReportes && next !== lastPath.current) {
        const scroller = scrollerFor(lastPath.current);
        if (scroller) scrollMemory.current[lastPath.current] = scroller.scrollTop;
      }
      if (fromHorarios && next !== "/horarios") {
        const scroller = scrollerFor("/horarios");
        if (scroller) scrollMemory.current["/horarios"] = scroller.scrollTop;
      }
      lastPath.current = next;
      setPath(next);
      if (next !== "/reporte-pantallas") setPdfReports(null);
      if (next === "/reporte-pantallas/nuevo") setFormVisited(true);
      if (next.startsWith("/admin-usuarios")) setAdminVisited(true);
      if (next === "/horarios") setHorariosVisited(true);
      if (next.startsWith("/reportes")) setReportesVisited(true);
      if (next === "/horarios" || next.startsWith("/reportes") || (fromHorarios || fromReportes) && next === "/otros") requestAnimationFrame(() => {
        if ((window.location.pathname.replace(/\/$/, "") || "/") !== next) return;
        const scroller = scrollerFor(next);
        if (scroller) scroller.scrollTop = scrollMemory.current[next] ?? 0;
      });
    };
    sync(); window.addEventListener("popstate", sync); window.addEventListener("casitas:navigate", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("casitas:navigate", sync); };
  }, []);
  const navigate = (next: string) => {
    const current = scrollerFor(path);
    if (current && (path.startsWith("/reportes") || path === "/reporte-pantallas" || path === "/admin-usuarios" || path === "/horarios" || path === "/otros")) scrollMemory.current[path] = current.scrollTop;
    window.history.pushState({ ...window.history.state, screen: "otros" }, "", next);
    window.dispatchEvent(new Event("casitas:navigate"));
    requestAnimationFrame(() => { const scroller = scrollerFor(next); if (scroller) scroller.scrollTop = next === "/reporte-pantallas/nuevo" ? 0 : scrollMemory.current[scrollKey(next)] ?? 0; });
  };
  const refresh = useCallback(async () => {
    if (fetching.current || !navigator.onLine) return;
    await Promise.resolve();
    if (fetching.current) return;
    fetching.current = true; setLoading(true);
    try {
      const result = await fetchPantallas();
      if (result.snapshot) { setSnapshot(result.snapshot); setCached(false); setError(""); await idbPut(IDB_STORES.snapshots, { id: "pantallas-v1", ...result.snapshot }).catch(() => setMessage("Datos actualizados. Este dispositivo no pudo guardar una copia sin conexión.")); }
      else setError(result.error || "No se pudo actualizar.");
    } catch { setError("No se pudo actualizar. Conservamos los últimos datos disponibles."); }
    finally { setLoading(false); fetching.current = false; }
  }, []);
  useEffect(() => {
    let live = true;
    void idbGet<PantallaSnapshot>(IDB_STORES.snapshots, "pantallas-v1").then(data => { if (live && data) { setSnapshot(previous => previous || data); } }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!active || !path.startsWith("/reporte-pantallas") || !online) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [active, path, online, refresh]);
  const searchExactCasita = /^\d+$/.test(search.trim());
  const searchLower = search.trim().toLocaleLowerCase();
  const reports = useMemo(() => (snapshot?.reports || []).filter(r => (!type || (r.tipo || "reporte") === type) && (!location || String(r.numero_casita) === location || r.origen_ubicacion === location || r.destino_ubicacion === location) && (!search || (searchExactCasita ? String(r.numero_casita) === search.trim() || r.origen_ubicacion === search.trim() || r.destino_ubicacion === search.trim() : `${r.nombre_usuario} ${r.notas || ""}`.toLocaleLowerCase().includes(searchLower)))), [snapshot, type, location, search, searchExactCasita, searchLower]);
  const inventory = useMemo(() => snapshot ? inventarioPantallas(snapshot.stock, snapshot.reports) : [], [snapshot]);
  const pdfCandidates = useMemo(() => {
    const visibleIds = new Set(reports.map(report => report.id));
    return latestPantallaReports(snapshot?.reports || []).filter(report => visibleIds.has(report.id));
  }, [snapshot, reports]);
  return <div className="otros-screen">
    <div hidden={path !== "/otros"}>
      <p className="pantalla-eyebrow">HERRAMIENTAS</p><h1>Otros</h1>
      <button type="button" className="pantalla-feature" onClick={() => navigate("/reportes")}><span className="pantalla-feature-icon"><Files size={27} aria-hidden /></span><span><strong>Reportes</strong></span><ArrowRight size={21} aria-hidden /></button>
      <button type="button" className="pantalla-feature" onClick={() => navigate("/horarios")}><span className="pantalla-feature-icon"><CalendarDays size={27} aria-hidden /></span><span><strong>Horario laboral</strong><small>Turnos, vacaciones, horas extras y feriados</small></span><ArrowRight size={21} aria-hidden /></button>
      <button type="button" className="pantalla-feature" onClick={() => navigate("/reporte-pantallas")}><span className="pantalla-feature-icon"><Monitor size={27} aria-hidden /></span><span><strong>Reporte de pantallas</strong><small>Revisiones, movimientos e inventario</small></span><ArrowRight size={21} aria-hidden /></button>
      {esAdmin && <AdminUsuariosFeature onOpen={() => navigate("/admin-usuarios")} />}
    </div>
    <div ref={listRef} hidden={path !== "/reporte-pantallas"}>
      <button type="button" onClick={() => navigate("/otros")}>← Otros</button>
      <div className="pantalla-toolbar"><h1>Reporte de pantallas</h1><button type="button" aria-label="Actualizar pantallas" disabled={loading || !online} onClick={() => void refresh()}><RefreshCw size={20} aria-hidden /></button></div>
      <p>Reporte estado de Pantallas, movimientos y inventario</p>
      <button type="button" className="pantalla-primary" onClick={() => navigate("/reporte-pantallas/nuevo")}><Plus size={20} aria-hidden /> Nuevo registro</button>
      <p role="status" className="pantalla-status">{loading ? "Actualizando…" : !online ? "Sin conexión · Últimos datos guardados" : cached || error ? "Últimos datos guardados" : snapshot ? "Datos actualizados" : "Sin datos disponibles"}{snapshot && ` · ${new Date(snapshot.updatedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })}`}</p>
      {message && <p role="status" className="pantalla-notice">{message}</p>}{error && <p role="alert" className="pantalla-error">{error}</p>}
      <div className="pantalla-tabs" aria-label="Vista de pantallas">{["historial", "inventario"].map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "historial" ? "Historial" : "Inventario"}</button>)}</div>
      <label>Ubicación<select aria-label="Ubicación" value={location} onChange={e => setLocation(e.target.value)}><option value="">Todas las ubicaciones</option>{UBICACIONES.map(v => <option key={v} value={v}>{ubicacionLabel(v)}</option>)}</select></label>
      {tab === "historial" ? <>
        <div className="pantalla-filters"><label>Tipo<select aria-label="Tipo" value={type} onChange={e => setType(e.target.value)}><option value="reporte">Reportes</option><option value="movimiento">Movimientos</option></select></label><label>Buscar<input type="search" placeholder="Usuario, nota o casita" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <div className="pantalla-toolbar"><span>{reports.length} registros</span><button type="button" disabled={!pdfCandidates.length} onClick={() => setPdfReports(pdfCandidates)}><FileDown size={18} aria-hidden /> Crear PDF</button></div>
        {loading && !snapshot && <div className="pantalla-skeleton" aria-label="Cargando registros" />}
        {!loading && !reports.length && <div className="pantalla-card"><h3>{snapshot ? "No hay registros para esta búsqueda" : "Todavía no hay datos disponibles"}</h3><p>{snapshot ? "Prueba otra ubicación o crea el primer reporte." : "Conéctate y pulsa actualizar para cargar el historial."}</p></div>}
        {reports.map(row => <article className="pantalla-card" key={row.id}><div className="pantalla-toolbar"><strong>{row.tipo === "movimiento" ? "Movimiento" : `Casita ${row.numero_casita}`}</strong><span className="pantalla-status">#{row.id}</span></div><p className="pantalla-status">{pantallaTime(row.fecha_hora)} · {row.nombre_usuario}</p>
          {row.tipo === "movimiento" ? <p>{movimientoLabel(row)}</p> : <PantallaPhotoGallery photos={row.fotos || []} casita={row.numero_casita} reportId={row.id} active={active && path === "/reporte-pantallas"} />}
          {row.notas && <p className="pantalla-notes">{row.notas}</p>}
        </article>)}
      </> : <>{snapshot ? <><p className="pantalla-status">{snapshot.reports.length ? "Calculado desde reportes y movimientos en orden de fecha." : "Inventario guardado; todavía no hay historial."}</p><div className="pantalla-inventory">{UBICACIONES.filter(v => !location || v === location).map(v => { const rooms = inventory.filter(item => item.ubicacion === v); const total = rooms.reduce((sum, r) => sum + r.cantidad, 0); return <article className="pantalla-card" key={v}><div className="pantalla-toolbar"><h3>{ubicacionLabel(v)}</h3><strong>{total === 0 && rooms.length && rooms.every(r => r.sinPantalla) ? "No tiene" : total}</strong></div>{rooms.map(r => <div className="pantalla-stock-row" key={r.habitacion}><span>{r.habitacion || "General"}</span><strong>{r.cantidad === 0 && r.sinPantalla ? "No tiene" : r.cantidad}</strong></div>)}</article>; })}</div></> : <p>Carga los datos para consultar el inventario.</p>}</>}
    </div>
    {formVisited && <div hidden={path !== "/reporte-pantallas/nuevo"}><PantallaForm key={formKey} onClose={() => navigate("/reporte-pantallas")} onSaved={text => { setMessage(text); setFormKey(k => k + 1); navigate("/reporte-pantallas"); void refresh(); }} /></div>}
    {pdfReports && active && path === "/reporte-pantallas" && <PantallaPdfSheet reports={pdfReports} onClose={() => setPdfReports(null)} />}
    {horariosVisited && <div ref={horariosRef} hidden={path !== "/horarios"}><HorariosScreen key={session.id} visible={active && path === "/horarios"} session={session} onBack={() => navigate("/otros")} /></div>}
    {reportesVisited && <div ref={reportesRef} hidden={!path.startsWith("/reportes")}><ReportesScreen key={session.id} path={path} visible={active && path.startsWith("/reportes")} usuarioId={session.id} navigate={navigate} /></div>}
    {esAdmin && adminVisited && <div ref={adminRef} hidden={!path.startsWith("/admin-usuarios")}><AdminUsuariosScreen visible={active && path.startsWith("/admin-usuarios")} path={path} navigate={navigate} session={session} /></div>}
  </div>;
}
