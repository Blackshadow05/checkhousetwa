"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArchiveRevisiones } from "@/app/actions/revisiones";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  ARCHIVE_PAGE_SIZE,
  filterArchiveLocally,
  type ArchivePeriod,
  type ReportFilter,
} from "@/lib/revisiones-archive";
import { replaceArchiveRow } from "@/lib/revision-edit";

const SEARCH_DEBOUNCE_MS = 350;

export function useRevisionesArchive() {
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
  const [rows, setRows] = useState(revisiones);
  const [total, setTotal] = useState(revisiones.length);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const generation = useRef(0);
  const loadingMoreRef = useRef(false);
  const filtersActive = search.length > 0 || period !== "all" || status !== null || reportFilter !== null || date !== "";

  const revisionesRef = useRef(revisiones);
  revisionesRef.current = revisiones;
  rowsRef.current = rows;

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const ids = new Set((event as CustomEvent<string[]>).detail);
      generation.current += 1;
      const removed = rowsRef.current.filter(row => ids.has(row.id)).length;
      setRows(current => current.filter(row => !ids.has(row.id)));
      setTotal(current => Math.max(0, current - removed));
      setLoading(false); setLoadingMore(false); loadingMoreRef.current = false;
    };
    window.addEventListener("casitas:revisiones-eliminadas", onDeleted);
    return () => window.removeEventListener("casitas:revisiones-eliminadas", onDeleted);
  }, []);

  useEffect(() => {
    rememberRevisiones(rows);
  }, [rememberRevisiones, rows]);

  useEffect(() => {
    if (!revisionPatch?.id) return;
    setRows((current) => replaceArchiveRow(current, revisionPatch));
    rememberRevisiones([revisionPatch]);
  }, [rememberRevisiones, revisionPatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (filtersActive) return;
    setRows((current) => {
      const ids = new Set(revisiones.map((item) => item.id));
      const oldest = revisiones.reduce<string | null>(
        (min, item) => (min === null || item.created_at < min ? item.created_at : min),
        null,
      );
      const extra = current.filter(
        (row) => !ids.has(row.id) && oldest !== null && row.created_at < oldest,
      );
      return [...revisiones, ...extra];
    });
  }, [filtersActive, revisiones]);

  const fetchPage = useCallback(
    async (offset: number, mode: "replace" | "append" | "count") => {
      if (!navigator.onLine) {
        const local = filterArchiveLocally(
          revisionesRef.current,
          search,
          period,
          status,
          today,
          reportFilter,
          date,
        );
        setRows(local);
        setTotal(local.length);
        setHasMore(false);
        return;
      }
      if (mode !== "append") generation.current += 1;
      const current = generation.current;
      if (mode === "append") {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else if (mode === "replace") {
        setLoading(true);
      }
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
          if (mode === "replace") {
            const local = filterArchiveLocally(
              revisionesRef.current,
              search,
              period,
              status,
              today,
              reportFilter,
              date,
            );
            setRows(local);
            setTotal(local.length);
            setHasMore(false);
          }
          return;
        }
        setArchiveError(null);
        setTotal(result.total);
        if (mode === "count") {
          setHasMore(rowsRef.current.length < result.total);
          return;
        }
        if (mode === "replace") {
          setRows(result.rows);
          setHasMore(result.rows.length < result.total);
          return;
        }
        const merged = [
          ...rowsRef.current,
          ...result.rows.filter(
            (row) =>
              Boolean(row.id) &&
              !rowsRef.current.some((item) => item.id === row.id),
          ),
        ];
        setRows(merged);
        setHasMore(merged.length < result.total);
      } catch {
        if (current !== generation.current) return;
        setArchiveError("No pudimos conectar para cargar más revisiones.");
      } finally {
        if (current === generation.current) {
          loadingMoreRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [date, period, reportFilter, search, status, today],
  );

  useEffect(() => {
    if (online) return;
    generation.current += 1;
    loadingMoreRef.current = false;
    setLoading(false);
    setLoadingMore(false);
    const local = filterArchiveLocally(
      revisiones,
      search,
      period,
      status,
      today,
      reportFilter,
      date,
    );
    setRows(local);
    setTotal(local.length);
    setHasMore(false);
    setArchiveError(null);
  }, [date, online, period, reportFilter, revisiones, search, status, today]);

  useEffect(() => {
    if (!online) return;
    if (!filtersActive) {
      setArchiveError(null);
      void fetchPage(0, "count");
      return;
    }
    void fetchPage(0, "replace");
  }, [date, fetchPage, filtersActive, online, period, reportFilter, revisiones, search, status, today]);

  const loadMore = useCallback(() => {
    if (!online || !hasMore || loading || loadingMoreRef.current) return;
    void fetchPage(rowsRef.current.length, "append");
  }, [fetchPage, hasMore, loading, online]);

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
    loading: loading && filtersActive,
    loadingMore,
    archiveError,
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
