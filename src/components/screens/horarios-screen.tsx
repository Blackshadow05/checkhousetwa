"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Moon, Palmtree, RefreshCw, Sun } from "lucide-react";
import { useHorarios } from "@/hooks/use-horarios";
import { CCSS_PORCENTAJE, clasificarTurno, colones, diasEntre, esEmpleadoDeUsuario, esFeriado, fechaCostaRica, fechaHorario, fechaValida, JORNADAS, pagoConQuincena, QUINCENA_CENTIMOS, resumenAusencias, resumenExtras, type HorarioRow } from "@/lib/horarios";
import type { UsuarioShell } from "@/types/database";
import { SegmentIndicator } from "@/components/ui/segment-indicator";
import { useSlideDirection } from "@/hooks/use-slide-direction";
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

function HorarioItem({ row, showEmployee = false, pago }: { row: HorarioRow; showEmployee?: boolean; pago?: { monto?: number; feriado: boolean } }) {
  const turno = clasificarTurno(row);
  return <article className={styles.shift} data-jornada={jornadaVisible(row)}>
    <div className={styles.shiftCopy}><strong>{showEmployee ? row.empleado : fechaHorario(row.fecha)}</strong>{!showEmployee && <span className={styles.shiftLabel}>{turno.label}</span>}</div>
    <div className={styles.shiftSchedule}><span className={styles.shiftTime}>{turno.horario}</span>
      {(turno.extrasMixtas > 0 || turno.extrasNocturnas > 0) && <span className={styles.extra}>{turno.extrasMixtas ? "+1 h extra mixta" : "+2 h extras nocturnas"}{pago?.feriado && " en feriado"}</span>}
      {pago?.monto !== undefined && <span className={styles.amount}>{colones(pago.monto)}</span>}
    </div>
  </article>;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", month: "long", year: "numeric" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", weekday: "short" });
const WEEKDAY_LONG_FORMAT = new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", weekday: "long" });

function noon(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function shiftMonth(month: string, delta: number) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function DayStrip({ value, today, marks, onChange }: { value: string; today: string; marks: Map<string, string>; onChange: (day: string) => void }) {
  const month = value.slice(0, 7);
  const days = useMemo(() => {
    const count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  }, [month]);
  const stripRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placedMonth = useRef("");

  useLayoutEffect(() => {
    const strip = stripRef.current, indicator = indicatorRef.current;
    if (!strip || !indicator) return;
    const place = (animate: boolean) => {
      const target = strip.querySelector<HTMLElement>(`[data-day="${value}"]`);
      if (!target || !target.offsetWidth) { placedMonth.current = ""; return; }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const smooth = animate && !reduced && placedMonth.current === month;
      if (!smooth) indicator.style.transition = "none";
      indicator.style.width = `${target.offsetWidth}px`;
      indicator.style.transform = `translateX(${target.offsetLeft}px)`;
      indicator.dataset.ready = "";
      if (!smooth) { void indicator.offsetWidth; indicator.style.transition = ""; }
      strip.scrollTo({ left: target.offsetLeft - (strip.clientWidth - target.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
      placedMonth.current = month;
    };
    place(true);
    let width = strip.clientWidth;
    const observer = new ResizeObserver(() => {
      if (strip.clientWidth === width) return;
      width = strip.clientWidth;
      place(false);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [value, month]);

  return <div ref={stripRef} className={styles.days} role="group" aria-label={`Días de ${MONTH_FORMAT.format(noon(value))}`}>
    <span ref={indicatorRef} className={styles.dayIndicator} aria-hidden />
    {days.map(day => <button type="button" key={day} data-day={day} data-today={day === today ? "" : undefined} aria-pressed={day === value} aria-label={fechaHorario(day, true)} onClick={() => onChange(day)}>
      <span className={styles.dayName}>{WEEKDAY_FORMAT.format(noon(day)).replace(".", "")}</span>
      <span className={styles.dayNumber}>{Number(day.slice(8))}</span>
      <span className={styles.dayDot} data-jornada={marks.get(day)} data-empty={marks.has(day) ? undefined : ""} />
    </button>)}
  </div>;
}

function ShiftCard({ when, fecha, row }: { when: string; fecha: string; row?: HorarioRow }) {
  const turno = row ? clasificarTurno(row) : null;
  const Icon = !turno ? CalendarDays : turno.jornada === "nocturno" ? Moon : turno.ausencia === "vacaciones" ? Palmtree : turno.ausencia ? CalendarDays : Sun;
  const title = !turno ? "Sin turno registrado" : turno.ausencia ? turno.label : turno.horario;
  const meta = [when, turno && !turno.ausencia ? turno.label : "", esFeriado(fecha) && turno?.ausencia !== "feriado" ? "Feriado" : ""].filter(Boolean).join(" · ");
  const content = <><span className={styles.nextIcon} aria-hidden><Icon size={20} /></span><span className={styles.nextCopy}><span className={styles.nextEyebrow}>Tu turno</span><strong>{title}</strong><span className={styles.nextMeta}>{meta}</span></span></>;
  const jornada = row ? jornadaVisible(row) : undefined;
  return <div className={styles.nextShift} data-jornada={jornada}>{content}</div>;
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={styles.empty}><CalendarDays size={26} aria-hidden /><h3>{title}</h3><p>{children}</p></div>;
}

export function HorariosScreen({ visible, session, onBack }: { visible: boolean; session: UsuarioShell; onBack: () => void }) {
  const { snapshot, loading, error, notice, cached, online, refresh } = useHorarios(visible, session.id);
  const [view, setView] = useState<View>("dia");
  const [today, setToday] = useState(fechaCostaRica);
  const [date, setDate] = useState(today);
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [holidayYear, setHolidayYear] = useState(today.slice(0, 4));
  const [withSalary, setWithSalary] = useState(false);
  const viewIndex = VIEWS.findIndex(item => item.id === view);
  const viewDirection = useSlideDirection(viewIndex);
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
  const mine = employees.find(name => esEmpleadoDeUsuario(name, session.nombre)) || "";
  const selectedEmployee = (person && employees.includes(person) ? person : "") || mine || employees[0] || "";
  const daily = useMemo(() => (rows || []).filter(row => row.fecha === date).sort((a, b) => a.empleado.localeCompare(b.empleado, "es")), [rows, date]);
  const marks = useMemo(() => new Map((rows || []).filter(row => row.empleado === mine && clasificarTurno(row).ausencia !== "libre").map(row => [row.fecha, jornadaVisible(row)])), [rows, mine]);
  const relativeDay = (fecha: string) => {
    const diff = diasEntre(today, fecha);
    return diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : diff === -1 ? "Ayer" : `${WEEKDAY_LONG_FORMAT.format(noon(fecha))} ${fechaHorario(fecha)}`;
  };
  const dayRow = mine ? (rows || []).find(row => row.empleado === mine && row.fecha === date) : undefined;
  const dayDirection = useSlideDirection(diasEntre("2000-01-01", fechaValida(date) ? date : today));
  const month = (fechaValida(date) ? date : today).slice(0, 7);
  const firstMonth = rows?.length ? rows[0].fecha.slice(0, 7) : month;
  const lastMonth = rows?.length ? rows[rows.length - 1].fecha.slice(0, 7) : month;
  const goToMonth = (delta: number) => {
    const target = shiftMonth(month, delta);
    setDate(target === today.slice(0, 7) ? today : `${target}-01`);
  };
  const dailyGroups = useMemo(() => JORNADAS
    .map(item => ({ id: item.id, label: ["diurno", "mixto", "nocturno"].includes(item.id) ? `Turno ${item.label.toLocaleLowerCase("es")}` : item.label, rows: daily.filter(row => jornadaVisible(row) === item.id) }))
    .filter(group => group.rows.length > 0), [daily]);
  const vacations = useMemo(() => resumenAusencias(rows || [], selectedEmployee, "vacaciones", today), [rows, selectedEmployee, today]);
  const holidays = useMemo(() => resumenAusencias(rows || [], selectedEmployee, "feriado", today), [rows, selectedEmployee, today]);
  const holidayYears = Array.from(new Set([today.slice(0, 4), holidayYear, ...(rows || []).filter(row => row.empleado === selectedEmployee && row.fecha <= today).map(row => row.fecha.slice(0, 4))])).sort().reverse();
  const yearHolidays = holidays.find(group => group.year === holidayYear);
  const rangeError = !fechaValida(from) || !fechaValida(to) ? "Selecciona ambas fechas." : from > to ? "La fecha inicial debe ser anterior o igual a la fecha final." : "";
  const extras = useMemo(() => resumenExtras(rows || [], selectedEmployee, from, to, today), [rows, selectedEmployee, from, to, today]);
  const ownView = Boolean(mine) && selectedEmployee === mine;
  const pay = withSalary ? pagoConQuincena(extras.brutoExacto) : { bruto: extras.bruto, neto: extras.neto };
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
    <nav className={styles.views} aria-label="Consultas del horario"><SegmentIndicator activeIndex={viewIndex} />{VIEWS.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={view === id} onClick={() => changeView(id)}><Icon size={18} aria-hidden />{label}</button>)}</nav>
    {view !== "dia" && <label>Colaborador<select value={selectedEmployee} onChange={event => setPerson(event.target.value)} disabled={!employees.length}>{!employees.length && <option value="">Sin colaboradores disponibles</option>}{employees.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
    {loading && !snapshot ? <div className={styles.skeletons} aria-label="Cargando horarios" aria-busy="true"><div /><div /><div /></div> : !snapshot ? <Empty title="Carga los horarios del equipo">Conéctate y pulsa actualizar. Después podrás consultar los últimos datos guardados sin conexión.</Empty> : <>
      {view === "dia" && <section key="dia" className="slide-enter" data-direction={viewDirection} aria-label="Horario del día">
        <div className={styles.monthBar}>
          <strong>{MONTH_FORMAT.format(noon(`${month}-01`)).replace(" de ", " ")}</strong>
          {date !== today && <button type="button" className={styles.todayChip} onClick={() => setDate(today)}>Hoy</button>}
          <button type="button" aria-label="Mes anterior" disabled={month <= firstMonth} onClick={() => goToMonth(-1)}><ChevronLeft size={20} aria-hidden /></button>
          <button type="button" aria-label="Mes siguiente" disabled={month >= lastMonth} onClick={() => goToMonth(1)}><ChevronRight size={20} aria-hidden /></button>
        </div>
        <DayStrip value={fechaValida(date) ? date : today} today={today} marks={marks} onChange={setDate} />
        {mine && fechaValida(date) && <ShiftCard key={`turno-${date}`} when={relativeDay(date)} fecha={date} row={dayRow} />}
        <div key={date} className="slide-enter" data-direction={dayDirection}>
          <div className={styles.row}><h2>{fechaValida(date) ? fechaHorario(date, true) : "Selecciona una fecha"}</h2><span className={styles.status}>{daily.length} {daily.length === 1 ? "colaborador" : "colaboradores"}</span></div>
          {dailyGroups.map(group => <section key={group.id} className={styles.shiftGroup} data-jornada={group.id} aria-label={group.label}>
            <div className={styles.groupHeading}><h3><span aria-hidden className={styles.groupDot} />{group.label}</h3><span className={styles.status}>{group.rows.length}</span></div>
            {group.rows.map(row => <HorarioItem key={row.id} row={row} showEmployee />)}
          </section>)}
          {!daily.length && <Empty title="No hay horarios para este día">Elige otro día del mes. Un día sin registro no se considera libre.</Empty>}
        </div>
      </section>}
      {view === "vacaciones" && <section key="vacaciones" className="slide-enter" data-direction={viewDirection} aria-label="Vacaciones por año"><h2>Vacaciones por año</h2>
        {vacations.map(group => <details className={styles.yearGroup} key={group.year} open><summary><span>{group.year}</span><span className={styles.yearTotal}>{group.total} {group.total === 1 ? "día" : "días"}</span></summary><div className={styles.dateGrid}>{group.days.map(row => <span className={styles.datePill} key={row.id}>{fechaHorario(row.fecha)}</span>)}</div></details>)}
        {!vacations.length && <Empty title="Sin vacaciones registradas">{selectedEmployee || "Este colaborador"} no tiene días de vacaciones registrados hasta hoy.</Empty>}
      </section>}
      {view === "extras" && <section key="extras" className="slide-enter" data-direction={viewDirection} aria-label="Horas extras por rango"><h2>Horas extras</h2><div className={styles.range}><label>Desde<input type="date" value={from} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "horarios-range-error" : undefined} onChange={event => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? "horarios-range-error" : undefined} onChange={event => setTo(event.target.value)} /></label></div>
        {rangeError ? <p id="horarios-range-error" role="alert" className={styles.notice}>{rangeError}</p> : <>
          <div className={styles.totals}>
            <article data-jornada="mixto" className={styles.total}><Sun size={20} aria-hidden /><span>Extras mixtas</span><strong>{extras.mixtas}<small> h</small></strong>{ownView && <span className={styles.totalAmount}>{colones(extras.montoMixtas)}</span>}{extras.mixtasFeriado > 0 && <span className={styles.totalNote}>{extras.mixtasFeriado} h en feriado</span>}</article>
            <article data-jornada="nocturno" className={styles.total}><Moon size={20} aria-hidden /><span>Extras nocturnas</span><strong>{extras.nocturnas}<small> h</small></strong>{ownView && <span className={styles.totalAmount}>{colones(extras.montoNocturnas)}</span>}{extras.nocturnasFeriado > 0 && <span className={styles.totalNote}>{extras.nocturnasFeriado} h en feriado</span>}</article>
          </div>
          {ownView && <>
          <button type="button" role="switch" aria-checked={withSalary} className={styles.salarySwitch} onClick={() => setWithSalary(value => !value)}>
            <span className={styles.salaryCopy}><strong>Sumar salario de la quincena</strong><small>{colones(QUINCENA_CENTIMOS.salario)}</small></span>
            <span className={styles.switchTrack} aria-hidden><span className={styles.switchThumb} /></span>
          </button>
          <dl className={styles.pay} aria-label={withSalary ? "Pago de la quincena con horas extras" : "Pago de horas extras en el rango"} aria-live="polite">
            <div><dt>Total bruto</dt><dd key={`b-${pay.bruto}`} className={styles.payValue}>{colones(pay.bruto)}</dd></div>
            <div className={styles.net}><dt>Total neto</dt><dd key={`n-${pay.neto}`} className={styles.payValue}>{colones(pay.neto)}<small>{`Menos CCSS ${CCSS_PORCENTAJE}`}</small></dd></div>
          </dl>
          <p className={styles.approx}>Los montos son aproximados y pueden variar respecto a tu planilla.</p>
          </>}
          <p className={styles.status}>Calculadas según los turnos registrados, incluyendo ambas fechas y hasta hoy. {rangeRows.length} {rangeRows.length === 1 ? "día con horario" : "días con horario"} en el rango.{extras.mixtasFeriado + extras.nocturnasFeriado > 0 && " Las extras en feriado se pagan dobles."}{ownView && " El neto no incluye el impuesto al salario."}</p>
          {extras.pendientes.length > 0 && <details className={styles.warning}><summary>{extras.pendientes.length} {extras.pendientes.length === 1 ? "turno sin regla de extras" : "turnos sin regla de extras"}</summary><p>El total incluye únicamente turnos con una regla definida.</p>{extras.pendientes.map(row => <p key={row.id}>{fechaHorario(row.fecha)} · {row.turno || "Sin turno"}</p>)}</details>}
          {extras.days.map(row => <HorarioItem key={row.id} row={row} pago={{ monto: ownView ? row.monto : undefined, feriado: row.mixtaFeriado || row.nocturnaFeriado }} />)}
          {!extras.days.length && <Empty title={rangeRows.length ? "No hay horas extras calculadas" : "No hay horarios en este rango"}>{rangeRows.length ? "Los turnos con una regla definida no suman extras en estas fechas." : "Selecciona un rango con horarios registrados para consultar las horas extras."}</Empty>}
        </>}
      </section>}
      {view === "feriados" && <section key="feriados" className="slide-enter" data-direction={viewDirection} aria-label="Feriados disfrutados"><h2>Feriados disfrutados</h2><label>Año<select value={holidayYear} onChange={event => setHolidayYear(event.target.value)}>{holidayYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label><div className={styles.holidaySummary}><Sun size={22} aria-hidden /><div><strong>{yearHolidays?.total || 0} {(yearHolidays?.total || 0) === 1 ? "día feriado" : "días feriados"}</strong><span>Registrados como Feriado en {holidayYear}</span></div></div>
        <p className={styles.status}>Solo se cuentan los días marcados como Feriado hasta hoy; los futuros quedan fuera del total.</p>
        {yearHolidays?.days.map(row => <HorarioItem key={row.id} row={row} />)}
        {!yearHolidays?.days.length && <Empty title="Sin feriados registrados este año">{selectedEmployee || "Este colaborador"} no tiene feriados disfrutados registrados en {holidayYear}.</Empty>}
      </section>}
      {coverage && <p className={styles.coverage}>Historial disponible: {coverage}.</p>}
    </>}
  </div>;
}
