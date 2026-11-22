"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchArchiveRevisiones } from "@/app/actions/revisiones";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  ARCHIVE_PAGE_SIZE,
  filterArchiveLocally,
  type ArchivePeriod,
  type ReportFilter,
} from "@/lib/revisiones-archive";
import { replaceArchiveRow } from "@/lib/revision-edit";
import type { InicioRevisionRow } from "@/types/database";

const SEARCH_DEBOUNCE_MS = 350;

export function useRevisionesArchive() {
  const {
    revisiones,
    pendientes,
    confirmadas,
    error,
    refreshing,
    online,
    today,
    localAvailable,
    storageError,
    refresh,
    openRevision,
    rememberRevisiones,
    revisionPatch,
  } = useRevisiones();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriodValue] = useState<ArchivePeriod>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [date, setDateValue] = useState("");
  const [reportFilter, setReportFilterValue] = useState<ReportFilter | null>(null);
  const setPeriod = (value: ArchivePeriod) => { setPeriodValue(value); setDateValue(""); };
  const setDate = (value: string) => { setDateValue(value); setPeriodValue("all"); };
  const setReportFilter = (value: ReportFilter | null) => { setReportFilterValue(value); setStatus(null); };

  const [extraUnfilteredRows, setExtraUnfilteredRows] = useState<InicioRevisionRow[]>([]);
  const [unfilteredTotal, setUnfilteredTotal] = useState<number | null>(null);
  const [filteredRows, setFilteredRows] = useState<InicioRevisionRow[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [filteredHasMore, setFilteredHasMore] = useState(false);
  const [loadedFilterKey, setLoadedFilterKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [appliedPatch, setAppliedPatch] = useState(revisionPatch);

  const filtersActive =
    search.length > 0 ||
    period !== "all" ||
    status !== null ||
    reportFilter !== null ||
    date !== "";
  const filterKey = `${search}|${period}|${status ?? ""}|${reportFilter ?? ""}|${date}|${today}`;
  const [prevFiltersActive, setPrevFiltersActive] = useState(filtersActive);

  if (prevFiltersActive !== filtersActive) {
    setPrevFiltersActive(filtersActive);
    if (!filtersActive) {
      setArchiveError(null);
      setLoadedFilterKey(null);
    }
  }

  if (appliedPatch !== revisionPatch) {
    setAppliedPatch(revisionPatch);
    if (revisionPatch?.id) {
      const nextFiltered = replaceArchiveRow(filteredRows, revisionPatch);
      if (nextFiltered !== filteredRows) setFilteredRows(nextFiltered);
      const nextExtra = replaceArchiveRow(extraUnfilteredRows, revisionPatch);
      if (nextExtra !== extraUnfilteredRows) setExtraUnfilteredRows(nextExtra);
    }
  }

  const generation = useRef(0);
  const loadingMoreRef = useRef(false);
  const revisionesRef = useRef(revisiones);
  const filteredRowsRef = useRef(filteredRows);
  const extraUnfilteredRowsRef = useRef(extraUnfilteredRows);
  const pendingIdsRef = useRef<Set<string>>(new Set());

  const offlineRows = useMemo(
    () =>
      online
        ? null
        : filterArchiveLocally(
            revisiones,
            search,
            period,
            status,
            today,
            reportFilter,
            date,
          ),
    [date, online, period, reportFilter, revisiones, search, status, today],
  );

  const unfilteredRows = useMemo(() => {
    if (!online || filtersActive) return null;
    if (!extraUnfilteredRows.length) return revisiones;
    const ids = new Set(revisiones.map((item) => item.id));
    const oldest = revisiones.reduce<string | null>(
      (min, item) => (min === null || item.created_at < min ? item.created_at : min),
      null,
    );
    const extra = extraUnfilteredRows.filter(
      (row) => !ids.has(row.id) && oldest !== null && row.created_at < oldest,
    );
    return extra.length ? [...revisiones, ...extra] : revisiones;
  }, [extraUnfilteredRows, filtersActive, online, revisiones]);

  const filteredWithOverlay = useMemo(() => {
    if (!online || !filtersActive) return null;
    const supersededIds = new Set(
      pendientes.flatMap((item) =>
        item.draft.completa ? [item.draft.id, item.draft.completa.id] : [item.draft.id],
      ),
    );
    const base = supersededIds.size
      ? filteredRows.filter((row) => !supersededIds.has(row.id))
      : filteredRows;
    const pendingRows = pendientes.map((item) => item.row);
    const confirmedRows = confirmadas.size
      ? revisiones.filter((row) => confirmadas.has(row.id))
      : [];
    if (!pendingRows.length && !confirmedRows.length) {
      return { rows: base, added: 0 };
    }
    const matchingOverlay = filterArchiveLocally(
      [...pendingRows, ...confirmedRows],
      search,
      period,
      status,
      today,
      reportFilter,
      date,
    );
    const existingIds = new Set(base.map((row) => row.id));
    const top = matchingOverlay.filter((row) => !existingIds.has(row.id));
    return {
      rows: top.length ? [...top, ...base] : base,
      added: top.length,
    };
  }, [
    confirmadas,
    date,
    filteredRows,
    filtersActive,
    online,
    pendientes,
    period,
    reportFilter,
    revisiones,
    search,
    status,
    today,
  ]);

  const rows = useMemo(
    () =>
      !online
        ? (offlineRows ?? [])
        : !filtersActive
          ? (unfilteredRows ?? revisiones)
          : (filteredWithOverlay?.rows ?? filteredRows),
    [filteredRows, filteredWithOverlay, filtersActive, offlineRows, online, revisiones, unfilteredRows],
  );

  const loading = online && filtersActive && loadedFilterKey !== filterKey;

  const total = !online
    ? rows.length
    : !filtersActive
      ? Math.max(unfilteredTotal ?? 0, rows.length)
      : Math.max(filteredTotal + (filteredWithOverlay?.added ?? 0), rows.length);

  const hasMore = !online
    ? false
    : !filtersActive
      ? unfilteredTotal !== null && rows.length < unfilteredTotal
      : filteredHasMore;

  const rowsRef = useRef(rows);

  useEffect(() => {
    revisionesRef.current = revisiones;
    rowsRef.current = rows;
    filteredRowsRef.current = filteredRows;
    extraUnfilteredRowsRef.current = extraUnfilteredRows;
    pendingIdsRef.current = new Set(pendientes.map((item) => item.draft.id));
  }, [extraUnfilteredRows, filteredRows, pendientes, revisiones, rows]);

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const ids = new Set((event as CustomEvent<string[]>).detail);
      if (!ids.size) return;
      generation.current += 1;
      const removedFiltered = filteredRowsRef.current.filter((row) => ids.has(row.id)).length;
      const removedVisible = rowsRef.current.filter((row) => ids.has(row.id)).length;
      setFilteredRows((current) => current.filter((row) => !ids.has(row.id)));
      setExtraUnfilteredRows((current) => current.filter((row) => !ids.has(row.id)));
      setFilteredTotal((current) => Math.max(0, current - removedFiltered));
      setUnfilteredTotal((current) =>
        current === null ? null : Math.max(0, current - removedVisible),
      );
      setLoadingMore(false);
      loadingMoreRef.current = false;
    };
    window.addEventListener("casitas:revisiones-eliminadas", onDeleted);
    return () => window.removeEventListener("casitas:revisiones-eliminadas", onDeleted);
  }, []);

  useEffect(() => {
    rememberRevisiones(rows);
  }, [rememberRevisiones, rows]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (online) return;
    generation.current += 1;
    loadingMoreRef.current = false;
  }, [online]);

  const fetchPage = useCallback(
    async (offset: number, mode: "replace" | "append" | "count") => {
      if (!navigator.onLine) return;
      if (mode !== "append") generation.current += 1;
      const current = generation.current;
      const applyLocalFallback = () => {
        const local = filterArchiveLocally(
          revisionesRef.current,
          search,
          period,
          status,
          today,
          reportFilter,
          date,
        );
        setFilteredRows(local);
        setFilteredTotal(local.length);
        setFilteredHasMore(false);
        setLoadedFilterKey(filterKey);
      };
      try {
        const result = await fetchArchiveRevisiones({
          search: mode === "count" ? "" : search,
          period: mode === "count" ? "all" : period,
          status: mode === "count" ? null : status,
          offset: mode === "count" ? 0 : offset,
          limit: mode === "count" ? 1 : ARCHIVE_PAGE_SIZE,
          today,
          reportFilter: mode === "count" ? null : reportFilter,
          date: mode === "count" ? "" : date,
        });
        if (current !== generation.current) return;
        if (result.error) {
          setArchiveError(
            "No pudimos consultar todas las revisiones. Conservamos lo ya cargado.",
          );
          if (mode === "replace") applyLocalFallback();
          return;
        }
        setArchiveError(null);
        if (mode === "count") {
          setUnfilteredTotal(result.total);
          return;
        }
        if (mode === "replace") {
          setFilteredRows(result.rows);
          setFilteredTotal(result.total);
          setFilteredHasMore(result.rows.length < result.total);
          setLoadedFilterKey(filterKey);
          return;
        }
        if (filtersActive) {
          const existing = filteredRowsRef.current;
          const existingIds = new Set(existing.map((item) => item.id));
          const merged = [
            ...existing,
            ...result.rows.filter((row) => Boolean(row.id) && !existingIds.has(row.id)),
          ];
          setFilteredRows(merged);
          setFilteredTotal(result.total);
          setFilteredHasMore(merged.length < result.total);
          return;
        }
        const existingVisible = rowsRef.current;
        const visibleIds = new Set(existingVisible.map((item) => item.id));
        const freshExtra = result.rows.filter((row) => Boolean(row.id) && !visibleIds.has(row.id));
        if (freshExtra.length) {
          setExtraUnfilteredRows((currentExtra) => {
            const extraIds = new Set(currentExtra.map((item) => item.id));
            return [
              ...currentExtra,
              ...freshExtra.filter((row) => !extraIds.has(row.id)),
            ];
          });
        }
        setUnfilteredTotal(result.total);
      } catch {
        if (current !== generation.current) return;
        setArchiveError(
          mode === "replace"
            ? "No pudimos consultar todas las revisiones. Conservamos lo ya cargado."
            : "No pudimos conectar para cargar más revisiones.",
        );
        if (mode === "replace") applyLocalFallback();
      } finally {
        if (current === generation.current) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [date, filterKey, filtersActive, period, reportFilter, search, status, today],
  );

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const mode = filtersActive ? "replace" : "count";
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchPage(0, mode);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, filtersActive, online]);

  const loadMore = useCallback(() => {
    if (!online || !hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const offset = filtersActive
      ? filteredRowsRef.current.length
      : rowsRef.current.filter((row) => !pendingIdsRef.current.has(row.id)).length;
    void fetchPage(offset, "append");
  }, [fetchPage, filtersActive, hasMore, loading, online]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPeriodValue("all");
    setDateValue("");
    setReportFilterValue(null);
    setStatus(null);
  }, []);

  return {
    searchInput,
    setSearchInput,
    period,
    setPeriod,
    status,
    setStatus,
    date,
    setDate,
    reportFilter,
    setReportFilter,
    rows,
    total,
    hasMore,
    loading,
    loadingMore: online && loadingMore,
    archiveError: online ? archiveError : null,
    error,
    refreshing,
    online,
    today,
    localAvailable,
    storageError,
    refresh,
    openRevision,
    loadMore,
    resetFilters,
    filterCount: Number(period !== "all" || date !== "") + Number(reportFilter !== null || status !== null),
    filtersActive,
  };
}
