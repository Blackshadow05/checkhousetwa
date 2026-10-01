"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Clock3, Moon, Palmtree, RefreshCw, Sun } from "lucide-react";
import { useHorarios } from "@/hooks/use-horarios";
import { clasificarTurno, fechaCostaRica, fechaHorario, fechaValida, JORNADAS, normalizarEmpleado, resumenAusencias, resumenExtras, type HorarioRow } from "@/lib/horarios";
import type { UsuarioShell } from "@/types/database";
import styles from "./horarios-screen.module.css";

const VIEWS = [
  { id: "dia", label: "Horario del día", icon: CalendarDays },
  { id: "vacaciones", label: "Vacaciones", icon: Palmtree },
  { id: "extras", label: "Horas extras", icon: Clock3 },
  { id: "feriados", label: "Feriados", icon: Sun },
] as const;
type View = typeof VIEWS[number]["id"];

function jornadaVisible(row: HorarioRow) {
  const jornada = clasificarTurno(row).jornada;
  return jornada === "sin-clasificar" ? "otros" : jornada;
}

function HorarioItem({ row, showEmployee = false }: { row: HorarioRow; showEmployee?: boolean }) {
  const turno = clasificarTurno(row);
  return <article className={styles.shift} data-jornada={jornadaVisible(row)}>
    <div className={styles.shiftCopy}><strong>{showEmployee ? row.empleado : fechaHorario(row.fecha)}</strong>{!showEmployee && <span className={styles.shiftLabel}>{turno.label}</span>}</div>
    <div className={styles.shiftSchedule}><span className={styles.shiftTime}>{turno.horario}</span>
      {(turno.extrasMixtas > 0 || turno.extrasNocturnas > 0) && <span className={styles.extra}>{turno.extrasMixtas ? "+1 h extra mixta" : "+2 h extras nocturnas"}</span>}
    </div>
  </article>;
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.empty}><CalendarDays size={26} aria-hidden /><h3>{title}</h3><p>{children}</p></div>;
}

export function HorariosScreen({ visible, session, onBack }: { visible: boolean; session: UsuarioShell; onBack: () => void }) {
  const { snapshot, loading, error, notice, cached, online, refresh } = useHorarios(visible, session.id);
  const [view, setView] = useState<View>("dia");
  const [today, setToday] = useState(fechaCostaRica);
  const [date, setDate] = useState(today);
  const [employee, setEmployee] = useState("");
  const [jornada, setJornada] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [holidayYear, setHolidayYear] = useState(today.slice(0, 4));
  const rootRef = useRef<HTMLDivElement>(null);
  const scrolls = useRef<Partial<Record<View, number>>>({});

  useEffect(() => {
    if (!visible) return;
    const updateDay = () => {
      const next = fechaCostaRica();
      setToday(next);
      if (today !== next) setDate(value => value === today ? next : value);
    };
    const initial = setTimeout(updateDay, 0);
    const timer = setInterval(updateDay, 60_000);
    document.addEventListener("visibilitychange", updateDay);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", updateDay); };
  }, [visible, today]);

  const rows = snapshot?.rows;
  const employees = useMemo(() => Array.from(new Set(rows?.map(row => row.empleado) || [])).sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const selectedEmployee = employee || employees.find(name => normalizarEmpleado(name) === normalizarEmpleado(session.nombre)) || employees[0] || "";
  const daily = useMemo(() => (rows || []).filter(row => row.fecha === date && (!employee || row.empleado === employee) && (!jornada || jornadaVisible(row) === jornada)).sort((a, b) => a.empleado.localeCompare(b.empleado, "es")), [rows, date, employee, jornada]);
  const dailyGroups = useMemo(() => JORNADAS
    .map(item => ({ id: item.id, label: ["diurno", "mixto", "nocturno"].includes(item.id) ? `Turno ${item.label.toLocaleLowerCase("es")}` : item.label, rows: daily.filter(row => jornadaVisible(row) === item.id) }))
    .filter(group => group.rows.length > 0), [daily]);
  const vacations = useMemo(() => resumenAusencias(rows || [], selectedEmployee, "vacaciones", today), [rows, selectedEmployee, today]);
  const holidays = useMemo(() => resumenAusencias(rows || [], selectedEmployee, "feriado", today), [rows, selectedEmployee, today]);
  const holidayYears = Array.from(new Set([today.slice(0, 4), holidayYear, ...(rows || []).filter(row => row.empleado === selectedEmployee && row.fecha <= today).map(row => row.fecha.slice(0, 4))])).sort().reverse();
  const yearHolidays = holidays.find(group => group.year === holidayYear);
  const rangeError = !fechaValida(from) || !fechaValida(to) ? "Selecciona ambas fechas." : from > to ? "La fecha inicial debe ser anterior o igual a la fecha final." : "";
  const extras = useMemo(() => resumenExtras(rows || [], selectedEmployee, from, to, today), [rows, selectedEmployee, from, to, today]);
  const rangeRows = (rows || []).filter(row => row.empleado === selectedEmployee && row.fecha >= from && row.fecha <= to && row.fecha <= today);
  const coverage = rows?.length ? `${fechaHorario(rows[0].fecha, true)} — ${fechaHorario(rows[rows.length - 1].fecha, true)}` : "";
  const changeView = (next: View) => {
    const scroller = rootRef.current?.closest<HTMLElement>(".app-screen");
    if (scroller) scrolls.current[view] = scroller.scrollTop;
    setView(next);
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = scrolls.current[next] ?? 0; });
  };

  return <div ref={rootRef} className={styles.screen}>
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={18} aria-hidden /> Otros</button>
    <div className={styles.row}><div><p className="pantalla-eyebrow">EQUIPO</p><h1>Horario laboral</h1></div><button type="button" className={styles.refresh} aria-label="Actualizar horarios" disabled={loading || !online} onClick={() => void refresh()}><RefreshCw size={20} aria-hidden className={loading ? styles.spinning : undefined} /></button></div>
    <p role="status" className={styles.status}>{loading ? "Actualizando horarios…" : snapshot ? !online ? "Sin conexión · Últimos datos guardados" : cached || error ? "Últimos datos guardados" : "Datos actualizados" : !online ? "Sin conexión · Sin datos guardados" : "Sin datos disponibles"}{snapshot && ` · ${new Date(snapshot.updatedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "short", timeStyle: "short" })}`}</p>
    {error && <p role="alert" className={styles.notice}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    <nav className={styles.views} aria-label="Consultas del horario">{VIEWS.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={view === id} onClick={() => changeView(id)}><Icon size={18} aria-hidden />{label}</button>)}</nav>
    <label>Colaborador<select value={view === "dia" ? employee : selectedEmployee} onChange={event => setEmployee(event.target.value)} disabled={!employees.length}>{view === "dia" && <option value="">Todos los colaboradores</option>}{!employees.length && view !== "dia" && <option value="">Sin colaboradores disponibles</option>}{employees.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
    {loading && !snapshot ? <div className={styles.skeletons} aria-label="Cargando horarios" aria-busy="true"><div /><div /><div /></div> : !snapshot ? <Empty title="Carga los horarios del equipo">Conéctate y pulsa actualizar. Después podrás consultar los últimos datos guardados sin conexión.</Empty> : <>
      {view === "dia" && <section aria-label="Horario del día">
        <div className={styles.filters}><label>Fecha<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><button type="button" className={styles.today} onClick={() => setDate(today)}>Hoy</button></div>
        <div className={styles.row}><h2>{fechaValida(date) ? fechaHorario(date, true) : "Selecciona una fecha"}</h2><span className={styles.status}>{daily.length} {daily.length === 1 ? "registro" : "registros"}</span></div>
        <label>Jornada<select value={jornada} onChange={event => setJornada(event.target.value)}><option value="">Todas las jornadas</option>{JORNADAS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {dailyGroups.map(group => <section key={group.id} className={styles.shiftGroup} data-jornada={group.id} aria-label={group.label}>
          <div className={styles.groupHeading}><h3><span aria-hidden className={styles.groupDot} />{group.label}</h3><span className={styles.status}>{group.rows.length} {group.rows.length === 1 ? "colaborador" : "colaboradores"}</span></div>
          {group.rows.map(row => <HorarioItem key={row.id} row={row} showEmployee />)}
        </section>)}
        {!daily.length && <Empty title="No hay horarios para esta selección">Prueba otra fecha, colaborador o jornada. Un día sin registro no se considera libre.</Empty>}
      </section>}
      {view === "vacaciones" && <section aria-label="Vacaciones por año"><h2>Vacaciones por año</h2>
        {vacations.map(group => <details className={styles.yearGroup} key={group.year} open><summary><span>{group.year}</span><span className={styles.yearTotal}>{group.total} {group.total === 1 ? "día" : "días"}</span></summary><div className={styles.dateGrid}>{group.days.map(row => <span className={styles.datePill} key={row.id}>{fechaHorario(row.fecha)}</span>)}</div></details>)}
        {!vacations.length && <Empty title="Sin vacaciones registradas">{selectedEmployee || "Este colaborador"} no tiene días de vacaciones registrados hasta hoy.</Empty>}
      </section>}
      {view === "extras" && <section aria-label="Horas extras por rango"><h2>Horas extras</h2><div className={styles.range}><label>Desde<input type="date" value={from} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "horarios-range-error" : undefined} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "horarios-range-error" : undefined} onChange={event => setTo(event.target.value)} /></label></div>
        {rangeError ? <p id="horarios-range-error" role="alert" className={styles.notice}>{rangeError}</p> : <>
          <div className={styles.totals}><article data-jornada="mixto" className={styles.total}><Sun size={20} aria-hidden /><span>Extras mixtas</span><strong>{extras.mixtas}<small> h</small></strong></article><article data-jornada="nocturno" className={styles.total}><Moon size={20} aria-hidden /><span>Extras nocturnas</span><strong>{extras.nocturnas}<small> h</small></strong></article></div>
          <p className={styles.status}>Calculadas según los turnos registrados, incluyendo ambas fechas y hasta hoy. {rangeRows.length} {rangeRows.length === 1 ? "día con horario" : "días con horario"} en el rango.</p>
          {extras.pendientes.length > 0 && <details className={styles.warning}><summary>{extras.pendientes.length} {extras.pendientes.length === 1 ? "turno sin regla de extras" : "turnos sin regla de extras"}</summary><p>El total incluye únicamente turnos con una regla definida.</p>{extras.pendientes.map(row => <p key={row.id}>{fechaHorario(row.fecha)} · {row.turno || "Sin turno"}</p>)}</details>}
          {extras.days.map(row => <HorarioItem key={row.id} row={row} />)}
          {!extras.days.length && <Empty title={rangeRows.length ? "No hay horas extras calculadas" : "No hay horarios en este rango"}>{rangeRows.length ? "Los turnos con una regla definida no suman extras en estas fechas." : "Selecciona un rango con horarios registrados para consultar las horas extras."}</Empty>}
        </>}
      </section>}
      {view === "feriados" && <section aria-label="Feriados disfrutados"><h2>Feriados disfrutados</h2><label>Año<select value={holidayYear} onChange={event => setHolidayYear(event.target.value)}>{holidayYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label><div className={styles.holidaySummary}><Sun size={22} aria-hidden /><div><strong>{yearHolidays?.total || 0} {(yearHolidays?.total || 0) === 1 ? "día feriado" : "días feriados"}</strong><span>Registrados como Feriado en {holidayYear}</span></div></div>
        <p className={styles.status}>Solo se cuentan los días marcados como Feriado hasta hoy; los futuros quedan fuera del total.</p>
        {yearHolidays?.days.map(row => <HorarioItem key={row.id} row={row} />)}
        {!yearHolidays?.days.length && <Empty title="Sin feriados registrados este año">{selectedEmployee || "Este colaborador"} no tiene feriados disfrutados registrados en {holidayYear}.</Empty>}
      </section>}
      {coverage && <p className={styles.coverage}>Historial disponible: {coverage}.</p>}
    </>}
  </div>;
}
