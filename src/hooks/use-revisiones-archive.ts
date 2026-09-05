"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArchiveRevisiones } from "@/app/actions/revisiones";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import {
  ARCHIVE_PAGE_SIZE,
  filterArchiveLocally,
  type ArchivePeriod,
} from "@/lib/revisiones-archive";

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
  } = useRevisiones();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<ArchivePeriod>("all");
  const [status, setStatus] = useState<string | null>(null);
  const [rows, setRows] = useState(revisiones);
  const [total, setTotal] = useState(revisiones.length);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const generation = useRef(0);
  const loadingMoreRef = useRef(false);
  const filtersActive = search.length > 0 || period !== "all" || status !== null;

  const revisionesRef = useRef(revisiones);
  revisionesRef.current = revisiones;
  rowsRef.current = rows;

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
    if (filtersActive) return;
    setRows((current) => {
      const extra = current.filter(
        (row) => !revisiones.some((item) => item.id === row.id),
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
    [period, search, status, today],
  );

  useEffect(() => {
    if (online) return;
    const local = filterArchiveLocally(
      revisiones,
      search,
      period,
      status,
      today,
    );
    setRows(local);
    setTotal(local.length);
    setHasMore(false);
    setArchiveError(null);
  }, [online, period, revisiones, search, status, today]);

  useEffect(() => {
    if (!online) return;
    if (!filtersActive) {
      setArchiveError(null);
      void fetchPage(0, "count");
      return;
    }
    void fetchPage(0, "replace");
  }, [fetchPage, filtersActive, online, period, revisiones, search, status, today]);

  const loadMore = useCallback(() => {
    if (!online || !hasMore || loading || loadingMoreRef.current) return;
    void fetchPage(rowsRef.current.length, "append");
  }, [fetchPage, hasMore, loading, online]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPeriod("all");
    setStatus(null);
  }, []);

  return {
    searchInput,
    setSearchInput,
    period,
    setPeriod,
    status,
    setStatus,
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
    filterCount: Number(period !== "all") + Number(status !== null),
    filtersActive,
  };
}
