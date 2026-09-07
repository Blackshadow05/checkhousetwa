"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  House,
  MessageSquareText,
  Search,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRevisionesArchive } from "@/hooks/use-revisiones-archive";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import {
  dayLabel,
  hasRevisionValue,
  initials,
  revisionDay,
  revisionKey,
  shortTime,
  statusAppearance,
} from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";
import styles from "./revisiones-screen.module.css";

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

export function RevisionesScreen({ savedRevision, onDismissSaved }: {
  savedRevision?: InicioRevisionRow | null;
  onDismissSaved?: () => void;
}) {
  const archive = useRevisionesArchive();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupByDay(archive.rows), [archive.rows]);

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
      <div className="welcome-block">
        <p className="eyebrow">TU EQUIPO, AL DÍA</p>
        <h1>
          Revisiones<span>.</span>
        </h1>
        <p>Busca por casita o por quien revisa, y sigue bajando para ver más.</p>
      </div>

      {savedRevision && <div className="revision-saved-notice" role="status">
        <Check size={19} aria-hidden="true" />
        <div><strong>Revisión guardada</strong><p>Casita {savedRevision.casita} · Confirmada en línea.</p><button type="button" className="text-action" onClick={() => archive.openRevision(savedRevision)}>Ver detalle</button></div>
        <button type="button" className="icon-button" aria-label="Cerrar confirmación" onClick={onDismissSaved}><X size={18} /></button>
      </div>}

      {!archive.online && (
        <div className="inline-notice" role="status">
          <WifiOff size={17} />
          <span>
            {archive.localAvailable
              ? "Sin conexión. La búsqueda cubre las revisiones guardadas en este dispositivo."
              : "Sin conexión. Mostramos los datos disponibles en esta sesión."}
          </span>
        </div>
      )}
      {archive.error && archive.online && (
        <div className="inline-notice notice-error" role="status">
          <span>
            No pudimos actualizar.{" "}
            {archive.rows.length
              ? "Conservamos tus últimas revisiones."
              : "Vuelve a intentarlo cuando tengas conexión."}
          </span>
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
          No se pudo guardar una copia en este dispositivo. Mantén la app
          abierta para consultar estos datos.
        </div>
      )}

      <div className="revisions-toolbar">
        <div className="section-title">
          <h2>Explorar registros</h2>
          <span className="count-label">{archive.total}</span>
        </div>
        <div className="search-row">
          <label className="search-field">
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              value={archive.searchInput}
              onChange={(event) => archive.setSearchInput(event.target.value)}
              placeholder="Buscar casita o persona"
              aria-label="Buscar casita o quien revisa"
              autoComplete="off"
              enterKeyHint="search"
            />
            {archive.searchInput ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpiar búsqueda"
                onClick={() => archive.setSearchInput("")}
              >
                <X size={17} />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className={`filter-button ${archive.filterCount ? "is-filtered" : ""}`}
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtrar revisiones${archive.filterCount ? `, ${archive.filterCount} filtros activos` : ""}`}
          >
            <SlidersHorizontal size={20} />
            {archive.filterCount > 0 ? (
              <span className="filter-dot">{archive.filterCount}</span>
            ) : null}
          </button>
        </div>
        <div className={`period-tabs ${styles.periods}`} aria-label="Filtrar por fecha">
          {(
            [
              { id: "all", label: "Todas" },
              { id: "today", label: "Hoy" },
              { id: "three-days", label: "Últimos 3 días" },
              { id: "week", label: "Últimos 7 días" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={archive.period === item.id}
              className={archive.period === item.id ? "is-selected" : ""}
              onClick={() => archive.setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {archive.status ? (
          <button
            className="active-filter"
            type="button"
            onClick={() => archive.setStatus(null)}
          >
            Caja fuerte: {statusAppearance(archive.status).label}
            <X size={15} />
            <span className="sr-only">Quitar filtro</span>
          </button>
        ) : null}
        <span className="sr-only" role="status">
          {archive.loading
            ? "Buscando revisiones"
            : archive.loadingMore
              ? "Cargando más revisiones"
              : `${archive.total} revisiones encontradas`}
        </span>
      </div>

      <div className="revision-groups" aria-busy={archive.loading || archive.loadingMore}>
        {archive.loading
          ? [0, 1, 2].map((item) => (
              <div
                key={item}
                 className={styles.card}
                aria-hidden="true"
              >
                 <div className={`${styles.plaque} skeleton`} />
                 <div className={styles.content}>
                   <div className="skeleton" style={{ width: "65%", height: 28 }} />
                   <div className="skeleton" style={{ width: "85%", height: 32, marginTop: 22 }} />
                 </div>
              </div>
            ))
          : Array.from(groups, ([day, dayRows]) => (
              <section
                key={day}
                className="revision-group"
                aria-label={dayLabel(day, archive.today)}
              >
                <div className={`group-heading ${styles.dayHeading}`}>
                  <h3>{dayLabel(day, archive.today)}</h3>
                  <span>
                    {dayRows.length}{" "}
                    {dayRows.length === 1 ? "revisión" : "revisiones"}
                  </span>
                </div>
                <div className="revision-grid">
                  {dayRows.map((row, index) => (
                    <button
                      key={revisionKey(row, index)}
                       className={styles.card}
                       data-tone={statusAppearance(row.caja_fuerte).tone}
                      type="button"
                      onClick={() => archive.openRevision(row)}
                      aria-label={`Ver revisión de Casita ${row.casita}, ${row.quien_revisa}, ${row.created_at}, ${statusAppearance(row.caja_fuerte).label}${hasRevisionValue(row.notas) ? ", con nota" : ""}`}
                    >
                       <span className={styles.plaque}>
                         <House size={17} strokeWidth={1.5} aria-hidden="true" />
                         <span className={styles.casitaLabel}>Casita</span>
                         <strong className={styles.number}>{row.casita}</strong>
                       </span>
                       <span className={styles.content}>
                         <span className={styles.top}>
                           <span className={styles.status}>
                             <span className={styles.safeLabel}>Caja fuerte</span>
                             <StatusBadge value={row.caja_fuerte} />
                           </span>
                           <span className={styles.arrow}>
                             <ChevronRight size={17} aria-hidden="true" />
                           </span>
                         </span>
                          {hasRevisionValue(row.notas) && (
                            <span className={styles.note}>
                              <MessageSquareText size={14} aria-hidden="true" />
                              <span>{row.notas?.trim()}</span>
                            </span>
                          )}
                          <span className={styles.footer}>
                           <span className={styles.reviewer}>
                             <span className={styles.avatar} aria-hidden="true">{initials(row.quien_revisa)}</span>
                             <span className={styles.name}>{row.quien_revisa}</span>
                           </span>
                           <span className={styles.time}>
                             <Clock3 size={12} aria-hidden="true" />
                             {shortTime(row.created_at)}
                           </span>
                         </span>
                       </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
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
              ? "No encontramos revisiones"
              : "Todo empieza con una revisión"}
          </h3>
          <p>
            {archive.searchInput || archive.filterCount
              ? "Prueba con el número de casita o el nombre de quien revisa."
              : "Las revisiones de tu equipo aparecerán aquí cuando estén disponibles."}
          </p>
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
      {archive.rows.length > 0 && !archive.loading ? (
        <p className="list-footnote">
          {archive.rows.length} de {archive.total} revisiones
          {!archive.online && archive.localAvailable
            ? " · Disponibles sin conexión"
            : ""}
        </p>
      ) : null}

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar revisiones"
      >
        <p className="sheet-description">Encuentra justo lo que necesitas.</p>
        <h3 className="filter-section-title">Caja fuerte</h3>
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
                  ? "Todos los estados"
                  : statusAppearance(value).label}
              </span>
              <span className="option-check">
                {archive.status === value ? <Check size={15} /> : null}
              </span>
            </button>
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
            Ver {archive.total} resultados
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
