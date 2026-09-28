"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchInventarioCasitas } from "@/app/actions/inventario";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { isInventarioCasita, type InventarioCasita } from "@/lib/inventario-casitas";

const SNAPSHOT_KEY = "inventario-casitas-v1";
type Snapshot = { id: typeof SNAPSHOT_KEY; rows: InventarioCasita[]; savedAt: string };
export type InventarioStatus = "idle" | "loading" | "guardado" | "actualizado" | "error";

export function useInventarioCasitas(enabled: boolean) {
  const [rows, setRows] = useState<InventarioCasita[] | null>(null);
  const [status, setStatus] = useState<InventarioStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current || !navigator.onLine) return;
    inFlight.current = true;
    setStatus((previous) => previous === "guardado" || previous === "actualizado" ? previous : "loading");
    try {
      const result = await fetchInventarioCasitas();
      if (result.error || !result.rows.length) {
        setStatus((previous) => previous === "guardado" || previous === "actualizado" ? previous : "error");
        return;
      }
      const now = new Date().toISOString();
      setRows(result.rows);
      setSavedAt(now);
      setStatus("actualizado");
      void idbPut<Snapshot>(IDB_STORES.snapshots, { id: SNAPSHOT_KEY, rows: result.rows, savedAt: now }).catch(() => {});
    } catch {
      setStatus((previous) => previous === "guardado" || previous === "actualizado" ? previous : "error");
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
        const cached = saved.rows.filter(isInventarioCasita);
        if (!cached.length) return;
        setRows((previous) => previous ?? cached);
        setSavedAt((previous) => previous ?? saved.savedAt);
        setStatus((previous) => previous === "actualizado" ? previous : "guardado");
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        if (navigator.onLine) void refresh();
        else setStatus((previous) => previous === "loading" ? "error" : previous);
      });
    return () => { cancelled = true; };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => { if (status !== "actualizado") void refresh(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, refresh, status]);

  return { rows, status, savedAt, refresh };
}
