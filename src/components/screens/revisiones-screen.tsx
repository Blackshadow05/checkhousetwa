"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardPen,
  CloudOff,
  LoaderCircle,
  ScanSearch,
  MessageSquareText,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  WifiOff,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { DateInput } from "@/components/ui/date-input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { RespuestaBusqueda } from "@/components/screens/respuesta-busqueda";
import { useRevisionesArchive } from "@/hooks/use-revisiones-archive";
import { useSavedRevisionDrafts } from "@/hooks/use-revision-draft";
import { esPreguntaNatural, useBusquedaInteligente } from "@/hooks/use-busqueda-inteligente";
import { useCursorAlFinal } from "@/hooks/use-cursor-al-final";
import { CAJA_FUERTE_FILTERS, REPORT_FILTERS, type ReportFilter } from "@/lib/revisiones-archive";
import { chipsDeFiltros } from "@/lib/busqueda-filtros";
import { fechaAbreviada, fechaTexto } from "@/lib/fechas";
import {
  dayLabel,
  hasRevisionValue,
  revisionDay,
  revisionKey,
  shortTime,
  statusAppearance,
} from "@/lib/revisiones-display";
import type { RevisionDraft, RevisionMode } from "@/lib/revision-form";
import type { PendingRevision } from "@/lib/revision-outbox";
import type { InicioRevisionRow } from "@/types/database";
import styles from "./revisiones-screen.module.css";

// Encabezado de la lista de la búsqueda inteligente según qué representan sus revisiones.
function etiquetaConteoBusqueda(tipo: "lista" | "cobertura" | "conteo", total: number) {
  const revisiones = `${total} ${total === 1 ? "revisión" : "revisiones"}`;
  if (tipo === "cobertura") return `${revisiones} en el periodo y rango de casitas`;
  if (tipo === "conteo") return `${revisiones} ${total === 1 ? "contada" : "contadas"}`;
  return `${revisiones} ${total === 1 ? "encontrada" : "encontradas"}`;
}

const PERIODS = [
  { id: "all", label: "Todas" },
  { id: "today", label: "Hoy" },
  { id: "three-days", label: "3 días" },
  { id: "week", label: "7 días" },
] as const;

const DATE_SEGMENT = PERIODS.length;

const REPORT_GROUPS: { id: string; label: string; options: { id: ReportFilter; label: string }[] }[] = [
  { id: "caja_fuerte", label: "Caja fuerte", options: [{ id: "caja_fuerte", label: "Todos" }] },
  { id: "trapo", label: "Trapo de binoculares", options: [{ id: "trapo_si", label: "Hay" }, { id: "trapo_no", label: "No hay" }] },
  { id: "sombrero", label: "Sombrero", options: [{ id: "sombrero_si", label: "Hay" }, { id: "sombrero_no", label: "No hay" }] },
  { id: "yute", label: "Bolso de yute", options: [{ id: "yute_si", label: "Hay" }, { id: "yute_dos", label: "Hay 2" }, { id: "yute_no", label: "No hay" }] },
  { id: "cola", label: "Cola de caballo", options: [{ id: "cola_si", label: "Hay" }, { id: "cola_no", label: "No hay" }] },
  { id: "notas", label: "Notas", options: [{ id: "nota", label: "Con nota" }, { id: "nota_extra", label: "Con nota extra" }] },
];

function reportGroupOf(filter: ReportFilter | null) {
  return filter ? REPORT_GROUPS.find((group) => group.options.some((option) => option.id === filter)) ?? null : null;
}

type ListDirection = "initial" | "none" | "forward" | "back";

function groupByDay(rows: InicioRevisionRow[]) {
  const result = new Map<string, InicioRevisionRow[]>();
  for (const row of rows) {
    const day = revisionDay(row.created_at);
    const current = result.get(day);
    if (current) current.push(row);
    else result.set(day, [row]);
  }
  return result;
}

const PENDING_LABEL: Record<PendingRevision["status"], string> = {
  saving: "Guardando…",
  waiting: "Sin conexión",
  error: "No se guardó",
};

export function RevisionesScreen({ onEditarPendiente, onCompletarPendiente, onContinuarGuardada }: {
  onEditarPendiente: (draft: RevisionDraft) => void;
  onContinuarGuardada: (draft: RevisionDraft) => void;
  onCompletarPendiente: (row: InicioRevisionRow, mode: RevisionMode) => void;
}) {
  const archive = useRevisionesArchive();
  const guardadas = useSavedRevisionDrafts();
  const inteligente = useBusquedaInteligente();
  const cursorAlFinal = useCursorAlFinal();
  const { busqueda } = inteligente;
  const puedePreguntar = esPreguntaNatural(archive.searchInput) && busqueda?.pregunta !== archive.searchInput.replace(/\s+/g, " ").trim();
  const { pendientes, reintentarRevision, tomarRevision, descartarRevision } = useRevisiones();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [porCompletar, setPorCompletar] = useState<InicioRevisionRow | null>(null);
  const pendingById = useMemo(() => new Map(pendientes.map((item) => [item.draft.id, item])), [pendientes]);
  const pendienteAbierto = pendienteId ? pendingById.get(pendienteId) ?? null : null;
  const cerrarPendiente = () => {
    setPendienteId(null);
    setConfirmarDescarte(false);
  };
  const sentinelRef = useRef<HTMLDivElement>(null);
  const busquedaSentinelRef = useRef<HTMLDivElement>(null);
  const busquedaConMas = busqueda?.estado === "lista" && busqueda.revisiones.length < busqueda.total && !busqueda.errorMas;
  const chipsBusqueda = busqueda?.estado === "lista" ? chipsDeFiltros(busqueda.filtros) : [];
  const { cargarMas } = inteligente;
  const groups = useMemo(() => groupByDay(archive.rows), [archive.rows]);
  const periodIndex = archive.date
    ? DATE_SEGMENT
    : PERIODS.findIndex((item) => item.id === archive.period);
  const reportCount = archive.reportFilter !== null || archive.status !== null ? 1 : 0;
  const selectedGroup = reportGroupOf(archive.reportFilter);
  const [listTransition, setListTransition] = useState<{
    index: number;
    direction: ListDirection;
  }>({ index: periodIndex, direction: "initial" });
  if (listTransition.index !== periodIndex) {
    setListTransition({
      index: periodIndex,
      direction:
        listTransition.index < 0 || periodIndex < 0
          ? "none"
          : periodIndex > listTransition.index
            ? "forward"
            : "back",
    });
  }

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !archive.hasMore) return;
    const root = node.closest(".app-screen");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) archive.loadMore();
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "280px",
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [archive.hasMore, archive.loadMore, archive.rows.length]);

  useEffect(() => {
    const node = busquedaSentinelRef.current;
    if (!node || !busquedaConMas) return;
    const root = node.closest(".app-screen");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void cargarMas();
      },
      { root: root instanceof Element ? root : null, rootMargin: "280px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [busquedaConMas, cargarMas, busqueda]);

  return (
    <section className="home-screen" aria-label="Revisiones">
      {!archive.online && (
        <div className="inline-notice" role="status">
          <WifiOff size={17} />
          <span>{archive.localAvailable ? "Sin conexión · datos guardados" : "Sin conexión"}</span>
        </div>
      )}
      {archive.error && archive.online && (
        <div className="inline-notice notice-error" role="status">
          <span>No pudimos actualizar</span>
          <button
            className="text-action"
            type="button"
            disabled={archive.refreshing}
            onClick={() => void archive.refresh()}
          >
            {archive.refreshing ? "Actualizando…" : "Reintentar"}
          </button>
        </div>
      )}
      {archive.archiveError && (
        <div className="inline-notice notice-error" role="status">
          {archive.archiveError}
        </div>
      )}
      {archive.storageError && (
        <div className="inline-notice" role="status">
          No se guardó copia en el dispositivo
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.titleRow}>
          <h2>Revisiones</h2>
          <span>{busqueda?.estado === "lista" ? busqueda.total : busqueda ? "" : archive.total}</span>
        </div>
        <form
          className={styles.searchRow}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (esPreguntaNatural(archive.searchInput) && archive.online) void inteligente.preguntar(archive.searchInput);
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          }}
        >
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              name="buscar-revision"
              {...cursorAlFinal}
              value={archive.searchInput}
              onChange={(event) => archive.setSearchInput(event.target.value)}
              placeholder="Buscar o preguntar"
              aria-label="Buscar casita o quien revisa, o hacer una pregunta"
              autoComplete="off"
              enterKeyHint="search"
            />
            {archive.searchInput ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  archive.setSearchInput("");
                  inteligente.cerrar();
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className={styles.filterButton}
            data-active={reportCount > 0 || undefined}
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtrar revisiones${reportCount ? ", 1 filtro activo" : ""}`}
          >
            <SlidersHorizontal size={19} />
            {reportCount > 0 ? (
              <span className={styles.filterDot}>{reportCount}</span>
            ) : null}
          </button>
        </form>
        {puedePreguntar && (
          <button
            type="button"
            className={styles.askButton}
            disabled={!archive.online}
            onClick={() => void inteligente.preguntar(archive.searchInput)}
          >
            <Sparkles size={17} aria-hidden="true" />
            <span>{archive.online ? `Preguntar «${archive.searchInput.trim()}»` : "Preguntar requiere conexión"}</span>
          </button>
        )}
        <div
          className={styles.segmented}
          role="group"
          aria-label="Filtrar por fecha"
          style={{ "--segment-index": Math.max(periodIndex, 0) } as CSSProperties}
        >
          <span
            className={styles.segmentIndicator}
            data-hidden={periodIndex < 0 || undefined}
            aria-hidden="true"
          />
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={!archive.date && archive.period === item.id}
              onClick={() => archive.setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
          <DateInput
            className={styles.dateSegment}
            name="fecha-revisiones"
            aria-label={archive.date ? `Fecha elegida ${fechaTexto(archive.date)}. Cambiar fecha` : "Elegir una fecha"}
            value={archive.date}
            max={archive.today}
            onValueChange={archive.setDate}
            display={<><CalendarDays size={15} aria-hidden="true" />{archive.date ? fechaAbreviada(archive.date) : "Fecha"}</>}
          />
        </div>
        {(archive.reportFilter || archive.status) && (
          <div className={styles.chips}>
            {archive.reportFilter && (
              <button type="button" onClick={() => archive.setReportFilter(null)}>
                {REPORT_FILTERS.find((item) => item.id === archive.reportFilter)?.label}
                <X size={14} aria-hidden="true" />
                <span className="sr-only">Quitar filtro</span>
              </button>
            )}
            {archive.status && (
              <button type="button" onClick={() => archive.setStatus(null)}>
                {statusAppearance(archive.status).label}
                <X size={14} aria-hidden="true" />
                <span className="sr-only">Quitar filtro</span>
              </button>
            )}
          </div>
        )}
        <span className="sr-only" role="status">
          {busqueda
            ? busqueda.estado === "buscando"
              ? "Buscando la respuesta"
              : busqueda.estado === "error"
                ? busqueda.error
                : busqueda.ajustando
                  ? "Ajustando filtros"
                  : busqueda.cargandoMas
                    ? "Cargando más revisiones"
                    : etiquetaConteoBusqueda(busqueda.tipo, busqueda.total)
            : archive.loading
              ? "Buscando revisiones"
              : archive.loadingMore
                ? "Cargando más revisiones"
                : `${archive.total} ${archive.total === 1 ? "revisión encontrada" : "revisiones encontradas"}`}
        </span>
      </div>

      {guardadas.length > 0 && (
        <section className={styles.saved} aria-label="Revisiones sin terminar">
          <div className={styles.dayHeading}>
            <h3>Sin terminar</h3>
            <span>{guardadas.length}</span>
          </div>
          <div className={styles.list}>
            {guardadas.map(({ draft, savedAt }) => {
              const casita = draft.values.casita ? String(Number(draft.values.casita)) : "";
              const hora = new Date(savedAt).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" });
              const modo = draft.mode === "reconocimiento" ? "Por reconocimiento" : "Ingreso manual";
              return (
                <button
                  key={draft.id}
                  type="button"
                  className={styles.row}
                  data-tone="amber"
                  onClick={() => onContinuarGuardada(draft)}
                  aria-label={`Continuar revisión${casita ? ` de Casita ${casita}` : ""}, ${modo}, guardada a las ${hora}`}
                >
                  <span className={styles.plaque}>
                    {casita ? <strong className={styles.number}>{casita}</strong> : <ClipboardPen size={20} aria-hidden="true" />}
                  </span>
                  <span className={styles.content}>
                    <span className={styles.top}>
                      <span className={styles.laterChip}>Sin terminar</span>
                    </span>
                    <span className={styles.name}>{modo} · {hora}</span>
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.continue}>Continuar</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {busqueda ? (
        <section className={styles.answer} aria-label="Respuesta de la búsqueda" aria-busy={busqueda.estado === "buscando"}>
          <div className={styles.answerHeading}>
            <Sparkles size={17} aria-hidden="true" />
            <span>{busqueda.pregunta}</span>
            <button type="button" aria-label="Cerrar respuesta" onClick={inteligente.cerrar}>
              <X size={18} />
            </button>
          </div>
          {busqueda.estado === "buscando" ? (
            <div className={styles.answerBody} role="status">
              <div className="skeleton" style={{ width: "85%", height: 14 }} />
              <div className="skeleton" style={{ width: "55%", height: 14 }} />
              <span className="sr-only">Buscando la respuesta</span>
            </div>
          ) : busqueda.estado === "error" ? (
            <div className={styles.answerBody} role="status">
              <p>{busqueda.error}</p>
              <button
                type="button"
                className="text-action"
                disabled={!archive.online}
                onClick={() => void inteligente.preguntar(busqueda.pregunta)}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {chipsBusqueda.length > 0 && (
                <div className={styles.chips} aria-label="Filtros de la búsqueda">
                  {chipsBusqueda.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      aria-label={`Quitar filtro ${chip.etiqueta}`}
                      disabled={busqueda.ajustando}
                      onClick={() => void inteligente.quitar(chip.id)}
                    >
                      {chip.etiqueta}
                      <X size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.answerBody} role="status" aria-busy={busqueda.ajustando}>
                {!busqueda.ajustando && !busqueda.ajustada && busqueda.respuesta ? (
                  <RespuestaBusqueda key={busqueda.respuesta} texto={busqueda.respuesta} />
                ) : (
                  <p>
                    {busqueda.ajustando
                      ? "Ajustando filtros…"
                      : busqueda.ajustada
                        ? `Filtros ajustados: ${busqueda.total} ${busqueda.total === 1 ? "revisión" : "revisiones"}.`
                        : busqueda.revisiones.length ? "Estas son las revisiones que coinciden." : "No encontramos revisiones que coincidan."}
                  </p>
                )}
                {busqueda.errorAjuste && <p>{busqueda.errorAjuste}</p>}
              </div>
              {busqueda.total > 0 && !busqueda.ajustando && (
                <div className={styles.dayHeading}>
                  <h3>{etiquetaConteoBusqueda(busqueda.tipo, busqueda.total)}</h3>
                  {busqueda.revisiones.length < busqueda.total && (
                    <span>{busqueda.revisiones.length} de {busqueda.total}</span>
                  )}
                </div>
              )}
              {busqueda.revisiones.length > 0 && (
                <div className={styles.list}>
                  {busqueda.revisiones.map((row, index) => (
                    <button
                      key={revisionKey(row, index)}
                      className={styles.row}
                      data-tone={statusAppearance(row.caja_fuerte).tone}
                      data-extra-note={hasRevisionValue(row.nota_extra) || undefined}
                      type="button"
                      onClick={() => archive.openRevision(row)}
                      aria-label={`Ver revisión de Casita ${row.casita}, ${row.quien_revisa}, ${dayLabel(revisionDay(row.created_at), archive.today)} ${shortTime(row.created_at)}${hasRevisionValue(row.notas) ? ", con nota" : ""}${hasRevisionValue(row.nota_extra) ? ", con nota extra" : ""}`}
                    >
                      <span className={styles.plaque}>
                        <strong className={styles.number}>{row.casita}</strong>
                      </span>
                      <span className={styles.content}>
                        <span className={styles.top}>
                          <StatusBadge value={row.caja_fuerte} />
                          {hasRevisionValue(row.notas) && (
                            <MessageSquareText size={14} className={styles.noteIcon} aria-hidden="true" />
                          )}
                          {hasRevisionValue(row.nota_extra) && (
                            <span className={styles.extraChip} aria-hidden="true"><StickyNote size={12} aria-hidden="true" /><span>Nota extra</span></span>
                          )}
                        </span>
                        <span className={styles.name}>{row.quien_revisa}</span>
                      </span>
                      <span className={styles.meta}>
                        <span className={styles.time}>{dayLabel(revisionDay(row.created_at), archive.today)} · {shortTime(row.created_at)}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div ref={busquedaSentinelRef} className="list-sentinel">
                {busqueda.cargandoMas ? "Cargando más…" : busqueda.errorMas ? (
                  <button type="button" className="text-action" onClick={() => void cargarMas()}>
                    {busqueda.errorMas} Reintentar
                  </button>
                ) : busquedaConMas && !busqueda.ajustando ? (
                  <button type="button" className="text-action" onClick={() => void cargarMas()}>
                    Ver más revisiones ({busqueda.total - busqueda.revisiones.length})
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : (<>
      <div
        key={`${archive.period}|${archive.date}`}
        className={styles.groups}
        data-direction={listTransition.direction}
        aria-busy={archive.loading || archive.loadingMore}
      >
        {archive.loading ? (
          <div className={styles.list} aria-hidden="true">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className={styles.row}>
                <div className={`${styles.plaque} skeleton`} />
                <div className={styles.content}>
                  <div className="skeleton" style={{ width: "40%", height: 16 }} />
                  <div className="skeleton" style={{ width: "60%", height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          Array.from(groups, ([day, dayRows]) => (
            <section key={day} aria-label={dayLabel(day, archive.today)}>
              <div className={styles.dayHeading}>
                <h3>{dayLabel(day, archive.today)}</h3>
                <span>{dayRows.length}</span>
              </div>
              <div className={styles.list}>
                {dayRows.map((row, index) => {
                  const pendiente = pendingById.get(row.id);
                  const marcada = row.pendiente && !pendiente;
                  const marcadaPor = row.marcada_por ?? row.quien_revisa;
                  const conNotaExtra = hasRevisionValue(row.nota_extra) ? ", con nota extra" : "";
                  return (
                  <button
                    key={revisionKey(row, index)}
                    className={styles.row}
                    data-tone={row.pendiente ? "pendiente" : statusAppearance(row.caja_fuerte).tone}
                    data-revision-card={row.id || undefined}
                    data-extra-note={hasRevisionValue(row.nota_extra) || undefined}
                    data-pending={pendiente?.status}
                    type="button"
                    aria-disabled={pendiente?.status === "saving" || undefined}
                    onClick={() => {
                      if (marcada) setPorCompletar(row);
                      else if (!pendiente) archive.openRevision(row);
                      else if (pendiente.status !== "saving") setPendienteId(row.id);
                    }}
                    aria-label={pendiente
                      ? `Casita ${row.casita}, ${row.quien_revisa}, ${PENDING_LABEL[pendiente.status]}${conNotaExtra}`
                      : marcada
                        ? `Casita ${row.casita} por completar, marcada por ${marcadaPor} a las ${shortTime(row.created_at)}. Completar${conNotaExtra}`
                      : `Ver revisión de Casita ${row.casita}, ${row.quien_revisa}, ${dayLabel(revisionDay(row.created_at), archive.today)} ${shortTime(row.created_at)}, ${statusAppearance(row.caja_fuerte).label}${hasRevisionValue(row.notas) ? ", con nota" : ""}${conNotaExtra}`}
                  >
                    <span className={styles.plaque}>
                      <strong className={styles.number}>{row.casita}</strong>
                    </span>
                    <span className={styles.content}>
                      <span className={styles.top}>
                        {row.pendiente
                          ? <span className={styles.laterChip}>Por completar</span>
                          : <StatusBadge value={row.caja_fuerte} />}
                        {hasRevisionValue(row.notas) && (
                          <MessageSquareText size={14} className={styles.noteIcon} aria-hidden="true" />
                        )}
                        {hasRevisionValue(row.nota_extra) && (
                          <span className={styles.extraChip} aria-hidden="true"><StickyNote size={12} aria-hidden="true" /><span>Nota extra</span></span>
                        )}
                      </span>
                      <span className={styles.name}>
                        {row.pendiente
                          ? `Marcada por ${marcadaPor}`
                          : row.marcada_por && row.marcada_por !== row.quien_revisa
                            ? `${row.quien_revisa} · marcó ${row.marcada_por}`
                            : row.quien_revisa}
                      </span>
                    </span>
                    {pendiente ? (
                      <span className={styles.pending} data-status={pendiente.status}>
                        {pendiente.status === "saving" ? <LoaderCircle size={15} className="revision-spinner" aria-hidden="true" />
                          : pendiente.status === "waiting" ? <CloudOff size={15} aria-hidden="true" />
                            : <CircleAlert size={15} aria-hidden="true" />}
                        {PENDING_LABEL[pendiente.status]}
                      </span>
                    ) : (
                      <span className={styles.meta}>
                        <span className={styles.time}>{shortTime(row.created_at)}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
      {!archive.loading && archive.rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            {archive.searchInput || archive.filterCount ? (
              <Search size={27} />
            ) : (
              <ClipboardCheck size={27} />
            )}
          </div>
          <h3>
            {archive.searchInput || archive.filterCount
              ? archive.date ? `Sin resultados el ${fechaTexto(archive.date)}` : "Sin resultados"
              : "Aún no hay revisiones"}
          </h3>
          {archive.searchInput || archive.filterCount > 0 ? (
            <button
              className="secondary-button"
              type="button"
              onClick={archive.resetFilters}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={sentinelRef} className="list-sentinel">
        {archive.loadingMore ? "Cargando más…" : null}
      </div>
      </>)}

      <BottomSheet
        open={Boolean(porCompletar)}
        onClose={() => setPorCompletar(null)}
        title={porCompletar ? `Casita ${porCompletar.casita}` : "Completar revisión"}
      >
        {porCompletar && (
          <>
            <p className="sheet-description">
              {porCompletar.marcada_por ?? porCompletar.quien_revisa} la marcó para completar después
              {" "}{revisionDay(porCompletar.created_at) === archive.today ? "hoy" : dayLabel(revisionDay(porCompletar.created_at), archive.today) === "Ayer" ? "ayer" : `el ${dayLabel(revisionDay(porCompletar.created_at), archive.today)}`}
              {" "}a las {shortTime(porCompletar.created_at)}. ¿Cómo quieres completarla?
            </p>
            <div className={styles.completeOptions}>
              {([
                { mode: "manual", label: "Ingreso manual", icon: <ClipboardPen size={20} aria-hidden="true" /> },
                { mode: "reconocimiento", label: "Por reconocimiento", icon: <ScanSearch size={20} aria-hidden="true" /> },
              ] as const).map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => {
                    const row = porCompletar;
                    setPorCompletar(null);
                    onCompletarPendiente(row, option.mode);
                  }}
                >
                  <span>{option.label}</span>
                  {option.icon}
                </button>
              ))}
            </div>
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={Boolean(pendienteAbierto)}
        onClose={cerrarPendiente}
        title={pendienteAbierto ? `Casita ${pendienteAbierto.row.casita}` : "Revisión pendiente"}
      >
        {pendienteAbierto && (
          <>
            <p className="sheet-description">
              {pendienteAbierto.status === "waiting"
                ? "Sin conexión. La revisión se enviará cuando vuelva la conexión."
                : pendienteAbierto.error ?? "No pudimos guardar la revisión."}
            </p>
            <div className="sheet-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const item = tomarRevision(pendienteAbierto.draft.id);
                  cerrarPendiente();
                  if (item) onEditarPendiente(item.draft);
                }}
              >
                Editar
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!archive.online}
                onClick={() => {
                  reintentarRevision(pendienteAbierto.draft.id);
                  cerrarPendiente();
                }}
              >
                Reintentar
              </button>
            </div>
            <button
              type="button"
              className={`text-action ${styles.discard}`}
              onClick={() => {
                if (!confirmarDescarte) {
                  setConfirmarDescarte(true);
                  return;
                }
                descartarRevision(pendienteAbierto.draft.id);
                cerrarPendiente();
              }}
            >
              {confirmarDescarte ? "Confirmar: descartar esta revisión" : "Descartar revisión"}
            </button>
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar revisiones"
      >
        <h3 className="filter-section-title">Reporte</h3>
        <div className="filter-options">
          <button type="button" aria-pressed={archive.reportFilter === null}
            className={archive.reportFilter === null ? "is-selected" : ""}
            onClick={() => archive.setReportFilter(null)}>
            <span>Todos</span>
            <span className="option-check">{archive.reportFilter === null ? <Check size={15} /> : null}</span>
          </button>
          {REPORT_GROUPS.map((group) => {
            const selected = selectedGroup?.id === group.id;
            const optionsId = `filtro-${group.id}`;
            return (
            <Fragment key={group.id}>
              <button type="button" aria-pressed={selected}
                aria-expanded={selected}
                aria-controls={selected ? optionsId : undefined}
                className={selected ? "is-selected" : ""}
                onClick={() => { if (!selected) archive.setReportFilter(group.options[0].id); }}>
                <span>{group.label}</span>
                <span className="option-check">{selected ? <Check size={15} /> : null}</span>
              </button>
              {selected && group.id !== "caja_fuerte" && (
                <div id={optionsId} className={styles.subOptions} role="group" aria-label={group.label}>
                  {group.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={archive.reportFilter === option.id}
                      onClick={() => archive.setReportFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {selected && group.id === "caja_fuerte" && (
                <div id={optionsId} className={styles.safeOptions} role="group" aria-label="Estado de caja fuerte">
                  <h3 className="filter-section-title">Estado</h3>
                  <div className="filter-options">
                    {[null, ...CAJA_FUERTE_FILTERS].map((value) => (
                      <button
                        key={value ?? "all"}
                        type="button"
                        aria-pressed={archive.status === value}
                        className={archive.status === value ? "is-selected" : ""}
                        onClick={() => archive.setStatus(value)}
                      >
                        <span>
                          {value === null
                            ? "Todos"
                            : statusAppearance(value).label}
                        </span>
                        <span className="option-check">
                          {archive.status === value ? <Check size={15} /> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Fragment>
            );
          })}
        </div>
        <div className="sheet-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!reportCount}
            onClick={() => archive.setReportFilter(null)}
          >
            Quitar filtro
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setFiltersOpen(false)}
          >
            Ver {archive.total}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
