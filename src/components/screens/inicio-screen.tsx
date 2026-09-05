"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  House,
  Search,
  SlidersHorizontal,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  dayLabel,
  initials,
  normalizeText,
  revisionDay,
  revisionKey,
  shortTime,
  statusAppearance,
} from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

type Period = "all" | "today" | "week";

export function InicioScreen({ archive = false }: { archive?: boolean }) {
  const {
    revisiones,
    error,
    refreshing,
    online,
    today,
    localAvailable,
    storageError,
    refresh,
    openRevision,
  } = useRevisiones();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(20);
  const statuses = useMemo(
    () => [...new Set(revisiones.map((row) => row.caja_fuerte))].sort(),
    [revisiones],
  );
  const filterCount = Number(period !== "all") + Number(status !== null);
  const filtered = useMemo(() => {
    const query = normalizeText(search);
    const weekStart = new Date(`${today}T12:00:00`);
    weekStart.setDate(weekStart.getDate() - 6);
    return revisiones.filter((row) => {
      const day = revisionDay(row.created_at);
      if (period === "today" && day !== today) return false;
      if (
        period === "week" &&
        (day === "sin-fecha" ||
          new Date(`${day}T12:00:00`) < weekStart ||
          day > today)
      )
        return false;
      if (status !== null && row.caja_fuerte !== status) return false;
      return (
        !query ||
        normalizeText(
          `casita ${row.casita} ${row.quien_revisa} ${row.caja_fuerte}`,
        ).includes(query)
      );
    });
  }, [revisiones, search, period, status, today]);
  const groups = useMemo(() => {
    const result = new Map<string, InicioRevisionRow[]>();
    for (const row of filtered.slice(0, limit)) {
      const day = revisionDay(row.created_at);
      result.set(day, [...(result.get(day) ?? []), row]);
    }
    return result;
  }, [filtered, limit]);
  const casitas = new Set(revisiones.map((row) => row.casita)).size;
  const people = new Set(revisiones.map((row) => row.quien_revisa)).size;
  const resetFilters = () => {
    setPeriod("all");
    setStatus(null);
    setSearch("");
    setLimit(20);
  };

  return (
    <section
      className="home-screen"
      aria-label={archive ? "Revisiones" : "Inicio"}
    >
      {!archive && (
        <>
          <div className="welcome-block">
            <p className="eyebrow date-eyebrow">
              {new Intl.DateTimeFormat("es-CR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(`${today}T12:00:00`))}
            </p>
            <h1>
              Todo en su lugar<span>.</span>
            </h1>
            <p>Un vistazo a las revisiones de tu equipo.</p>
          </div>
          <div className="activity-card">
            <div className="activity-main">
              <span className="activity-label">
                <span className="activity-dot" /> ACTIVIDAD RECIENTE
              </span>
              <div className="activity-total">
                <strong>{revisiones.length}</strong>
                <span>revisiones</span>
              </div>
              <span className="activity-caption">
                Últimos {revisiones.length} registros
              </span>
            </div>
            <div className="activity-stats">
              <div>
                <House size={17} aria-hidden="true" />
                <span>
                  <strong>{casitas}</strong> casitas
                </span>
              </div>
              <div>
                <Users size={17} aria-hidden="true" />
                <span>
                  <strong>{people}</strong> personas
                </span>
              </div>
            </div>
          </div>
        </>
      )}
      {archive && (
        <div className="welcome-block">
          <p className="eyebrow">TU EQUIPO, AL DÍA</p>
          <h1>
            Revisiones<span>.</span>
          </h1>
          <p>Consulta los últimos {revisiones.length} registros.</p>
        </div>
      )}

      {!online && (
        <div className="inline-notice" role="status">
          <WifiOff size={17} />
          <span>
            {localAvailable
              ? "Sin conexión. Estás viendo tus revisiones guardadas."
              : "Sin conexión. Mostramos los datos disponibles en esta sesión."}
          </span>
        </div>
      )}
      {error && online && (
        <div className="inline-notice notice-error" role="status">
          <span>
            No pudimos actualizar.{" "}
            {revisiones.length
              ? "Conservamos tus últimas revisiones."
              : "Vuelve a intentarlo cuando tengas conexión."}
          </span>
          <button
            className="text-action"
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {refreshing ? "Actualizando…" : "Reintentar"}
          </button>
        </div>
      )}
      {storageError && (
        <div className="inline-notice" role="status">
          No se pudo guardar una copia en este dispositivo. Mantén la app
          abierta para consultar estos datos.
        </div>
      )}

      <div className="revisions-toolbar">
        <div className="section-title">
          <h2>{archive ? "Explorar registros" : "Últimas revisiones"}</h2>
          <span className="count-label">{revisiones.length}</span>
        </div>
        <div className="search-row">
          <label className="search-field">
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(20);
              }}
              placeholder="Buscar casita o persona"
              aria-label="Buscar casita o persona"
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch("")}
              >
                <X size={17} />
              </button>
            )}
          </label>
          <button
            type="button"
            className={`filter-button ${filterCount ? "is-filtered" : ""}`}
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtrar revisiones${filterCount ? `, ${filterCount} filtros activos` : ""}`}
          >
            <SlidersHorizontal size={20} />
            {filterCount > 0 && (
              <span className="filter-dot">{filterCount}</span>
            )}
          </button>
        </div>
        <div className="period-tabs" aria-label="Filtrar por fecha">
          {(
            [
              { id: "all", label: "Todas" },
              { id: "today", label: "Hoy" },
              { id: "week", label: "Últimos 7 días" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              className={period === item.id ? "is-selected" : ""}
              onClick={() => {
                setPeriod(item.id);
                setLimit(20);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {status && (
          <button
            className="active-filter"
            type="button"
            onClick={() => setStatus(null)}
          >
            Caja fuerte: {statusAppearance(status).label}
            <X size={15} />
            <span className="sr-only">Quitar filtro</span>
          </button>
        )}
        <span className="sr-only" role="status">
          {refreshing
            ? "Actualizando revisiones"
            : `${filtered.length} revisiones encontradas`}
        </span>
      </div>

      <div className="revision-groups" aria-busy={refreshing}>
        {Array.from(groups, ([day, rows]) => (
          <section
            key={day}
            className="revision-group"
            aria-label={dayLabel(day, today)}
          >
            <div className="group-heading">
              <h3>{dayLabel(day, today)}</h3>
              <span>
                {
                  filtered.filter((row) => revisionDay(row.created_at) === day)
                    .length
                }{" "}
                {filtered.filter((row) => revisionDay(row.created_at) === day)
                  .length === 1
                  ? "revisión"
                  : "revisiones"}
              </span>
            </div>
            <div className="revision-grid">
              {rows.map((row, index) => (
                <button
                  key={revisionKey(row, index)}
                  className="revision-card"
                  type="button"
                  onClick={() => openRevision(row)}
                  aria-label={`Ver revisión de Casita ${row.casita}, ${row.quien_revisa}, ${row.created_at}`}
                >
                  <div className="revision-card-top">
                    <div className="casita-icon">
                      <House size={23} strokeWidth={1.6} aria-hidden="true" />
                    </div>
                    <div className="revision-identity">
                      <h4>Casita {row.casita}</h4>
                      <div className="reviewer">
                        <span className="person-initials" aria-hidden="true">
                          {initials(row.quien_revisa)}
                        </span>
                        <span>{row.quien_revisa}</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={19}
                      className="card-chevron"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="revision-card-bottom">
                    <div className="safe-status">
                      <span className="safe-label">Caja fuerte</span>
                      <StatusBadge value={row.caja_fuerte} />
                    </div>
                    <span className="revision-time">
                      <Clock3 size={13} aria-hidden="true" />
                      {shortTime(row.created_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            {search || filterCount ? (
              <Search size={27} />
            ) : (
              <ClipboardCheck size={27} />
            )}
          </div>
          <h3>
            {search || filterCount
              ? "No encontramos revisiones"
              : "Todo empieza con una revisión"}
          </h3>
          <p>
            {search || filterCount
              ? "Prueba con otra casita, persona o fecha."
              : "Las revisiones de tu equipo aparecerán aquí cuando estén disponibles."}
          </p>
          {(search || filterCount > 0) && (
            <button
              className="secondary-button"
              type="button"
              onClick={resetFilters}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
      {filtered.length > limit && (
        <button
          type="button"
          className="load-more"
          onClick={() => setLimit((current) => current + 20)}
        >
          Ver más revisiones <span>{filtered.length - limit} restantes</span>
        </button>
      )}
      {filtered.length > 0 && (
        <p className="list-footnote">
          {Math.min(limit, filtered.length)} de {filtered.length} revisiones
          {localAvailable ? " · Disponibles sin conexión" : ""}
        </p>
      )}

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar revisiones"
      >
        <p className="sheet-description">Encuentra justo lo que necesitas.</p>
        <h3 className="filter-section-title">Caja fuerte</h3>
        <div className="filter-options">
          {[null, ...statuses].map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              aria-pressed={status === value}
              className={status === value ? "is-selected" : ""}
              onClick={() => {
                setStatus(value);
                setLimit(20);
              }}
            >
              <span>
                {value === null
                  ? "Todos los estados"
                  : statusAppearance(value).label}
              </span>
              <span className="option-check">
                {status === value && <Check size={15} />}
              </span>
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={resetFilters}
          >
            Restablecer
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setFiltersOpen(false)}
          >
            Ver {filtered.length} resultados
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
