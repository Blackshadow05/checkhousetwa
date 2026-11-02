"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOperacionesMemo } from "@/app/actions/operaciones-memo";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { esOperacionMemo, type OperacionMemo } from "@/lib/operaciones-memo";

const SNAPSHOT_KEY = "operaciones-memo-v1";
type Snapshot = { id: typeof SNAPSHOT_KEY; rows: OperacionMemo[]; savedAt: string };

export function useOperacionesMemo(enabled: boolean) {
  const [rows, setRows] = useState<OperacionMemo[] | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current || !navigator.onLine) return;
    inFlight.current = true;
    try {
      const result = await fetchOperacionesMemo();
      if (result.error) {
        setRows((previous) => previous ?? []);
        return;
      }
      const now = new Date().toISOString();
      setRows(result.rows);
      setConfirmado(true);
      void idbPut<Snapshot>(IDB_STORES.snapshots, { id: SNAPSHOT_KEY, rows: result.rows, savedAt: now }).catch(() => {});
    } catch {
      setRows((previous) => previous ?? []);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void idbGet<Snapshot>(IDB_STORES.snapshots, SNAPSHOT_KEY)
      .then((saved) => {
        if (cancelled || !saved || !Array.isArray(saved.rows)) return;
        const cached = saved.rows.filter(esOperacionMemo);
        setRows((previous) => previous ?? cached);
        setConfirmado(true);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        if (navigator.onLine) void refresh();
        else setRows((previous) => previous ?? []);
      });
    return () => { cancelled = true; };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => { void refresh(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, refresh]);

  return { rows, confirmado };
}
