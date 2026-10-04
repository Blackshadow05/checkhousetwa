"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  MessageSquareText,
  Search,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisionesArchive } from "@/hooks/use-revisiones-archive";
import { CAJA_FUERTE_FILTERS, REPORT_FILTERS } from "@/lib/revisiones-archive";
import {
  dayLabel,
  hasRevisionValue,
  revisionDay,
  revisionKey,
  shortTime,
  statusAppearance,
} from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";
import styles from "./revisiones-screen.module.css";

const PERIODS = [
  { id: "all", label: "Todas" },
  { id: "today", label: "Hoy" },
  { id: "three-days", label: "3 días" },
  { id: "week", label: "7 días" },
] as const;

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

export function RevisionesScreen() {
  const archive = useRevisionesArchive();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupByDay(archive.rows), [archive.rows]);
  const periodIndex = archive.date
    ? -1
    : PERIODS.findIndex((item) => item.id === archive.period);
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
          <span>{archive.total}</span>
        </div>
        <div className={styles.searchRow}>
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={archive.searchInput}
              onChange={(event) => archive.setSearchInput(event.target.value)}
              placeholder="Buscar"
              aria-label="Buscar casita o quien revisa"
              autoComplete="off"
              enterKeyHint="search"
            />
            {archive.searchInput ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Limpiar búsqueda"
                onClick={() => archive.setSearchInput("")}
              >
                <X size={14} />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className={styles.filterButton}
            data-active={archive.filterCount > 0 || undefined}
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtrar revisiones${archive.filterCount ? `, ${archive.filterCount} filtros activos` : ""}`}
          >
            <SlidersHorizontal size={19} />
            {archive.filterCount > 0 ? (
              <span className={styles.filterDot}>{archive.filterCount}</span>
            ) : null}
          </button>
        </div>
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
        </div>
        {(archive.reportFilter || archive.status || archive.date) && (
          <div className={styles.chips}>
            {archive.date && (
              <button type="button" onClick={() => archive.setDate("")}>
                {archive.date}
                <X size={14} aria-hidden="true" />
                <span className="sr-only">Quitar fecha</span>
              </button>
            )}
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
          {archive.loading
            ? "Buscando revisiones"
            : archive.loadingMore
              ? "Cargando más revisiones"
              : `${archive.total} revisiones encontradas`}
        </span>
      </div>

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
                {dayRows.map((row, index) => (
                  <button
                    key={revisionKey(row, index)}
                    className={styles.row}
                    data-tone={statusAppearance(row.caja_fuerte).tone}
                    data-revision-card={row.id || undefined}
                    type="button"
                    onClick={() => archive.openRevision(row)}
                    aria-label={`Ver revisión de Casita ${row.casita}, ${row.quien_revisa}, ${row.created_at}, ${statusAppearance(row.caja_fuerte).label}${hasRevisionValue(row.notas) ? ", con nota" : ""}`}
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
                      </span>
                      <span className={styles.name}>{row.quien_revisa}</span>
                    </span>
                    <span className={styles.meta}>
                      <span className={styles.time}>{shortTime(row.created_at)}</span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </span>
                  </button>
                ))}
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
              ? "Sin resultados"
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

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar revisiones"
      >
        <div className={styles.dateRow}>
          <label className={styles.dateField}>
            <span>Fecha</span>
            <input type="date" value={archive.date} onChange={(event) => archive.setDate(event.target.value)} />
          </label>
          {archive.date && <button type="button" className="icon-button" aria-label="Quitar fecha" onClick={() => archive.setDate("")}><X size={18} /></button>}
        </div>
        <h3 className="filter-section-title">Reporte</h3>
        <div className="filter-options">
          {[{ id: null, label: "Todos" }, ...REPORT_FILTERS].map((item) => (
            <Fragment key={item.id ?? "all"}>
              <button type="button" aria-pressed={archive.reportFilter === item.id}
                aria-expanded={item.id === "caja_fuerte" ? archive.reportFilter === "caja_fuerte" : undefined}
                aria-controls={item.id === "caja_fuerte" && archive.reportFilter === "caja_fuerte" ? "caja-fuerte-options" : undefined}
                className={archive.reportFilter === item.id ? "is-selected" : ""}
                onClick={() => archive.setReportFilter(item.id)}>
                <span>{item.label}</span>
                <span className="option-check">{archive.reportFilter === item.id ? <Check size={15} /> : null}</span>
              </button>
              {item.id === "caja_fuerte" && archive.reportFilter === "caja_fuerte" && (
                <div id="caja-fuerte-options" className={styles.safeOptions} role="group" aria-label="Estado de caja fuerte">
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
          ))}
        </div>
        <div className="sheet-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={archive.resetFilters}
          >
            Restablecer
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
