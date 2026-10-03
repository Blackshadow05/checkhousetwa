"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLoginLogs } from "@/app/actions/login-logs";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import type { LoginLogsSnapshot } from "@/lib/login-logs";
import { useOnline } from "@/lib/use-online";

export function useLoginLogs(visible: boolean, ownerId: number) {
  const [snapshot, setSnapshot] = useState<LoginLogsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cached, setCached] = useState(true);
  const fetching = useRef(false);
  const mounted = useRef(false);
  const needsRefresh = useRef(true);
  const current = useRef<LoginLogsSnapshot | null>(null);
  const denied = useRef(false);
  const online = useOnline();
  const cacheId = `login-logs-v1-${ownerId}`;

  useEffect(() => {
    mounted.current = true;
    let live = true;
    void idbGet<{ snapshot: LoginLogsSnapshot | null }>(IDB_STORES.snapshots, cacheId).then(data => {
      if (live && !current.current && !denied.current && data?.snapshot?.ownerId === ownerId) {
        current.current = data.snapshot;
        setSnapshot(data.snapshot);
      }
    }).catch(() => {});
    return () => { live = false; mounted.current = false; };
  }, [cacheId, ownerId]);

  const load = useCallback(async (more = false) => {
    if (fetching.current || !navigator.onLine) return;
    const previous = current.current;
    if (more && !previous?.nextCursor) return;
    fetching.current = true;
    if (more) setLoadingMore(true); else setLoading(true);
    try {
      const result = await fetchLoginLogs(more ? previous?.nextCursor : null);
      if (!mounted.current) return;
      if (result.denied || result.snapshot && result.snapshot.ownerId !== ownerId) {
        denied.current = true;
        current.current = null; setSnapshot(null);
        setError(result.error || "La sesión cambió. Vuelve a iniciar sesión.");
        await idbPut(IDB_STORES.snapshots, { id: cacheId, snapshot: null }).catch(() => {});
        return;
      }
      if (!result.snapshot) { setError(result.error || "No se pudo cargar el historial."); return; }
      const next = result.snapshot;
      const knownIds = new Set(previous?.rows.map(row => row.id));
      const updated = more && previous ? { ...next, rows: [...previous.rows, ...next.rows.filter(row => !knownIds.has(row.id))] } : next;
      denied.current = false; needsRefresh.current = false; current.current = updated;
      setSnapshot(updated); setCached(false); setError(""); setNotice("");
      await idbPut(IDB_STORES.snapshots, { id: cacheId, snapshot: updated }).catch(() => {
        if (mounted.current) setNotice("Actualizado. No se pudo guardar en este dispositivo.");
      });
    } catch {
      if (mounted.current) setError(more ? "No se pudieron cargar más accesos. Inténtalo de nuevo." : "No se pudo actualizar. Conservamos los últimos accesos.");
    } finally {
      fetching.current = false;
      if (mounted.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [cacheId, ownerId]);

  useEffect(() => {
    if (!online) needsRefresh.current = true;
    if (!visible || !online || !needsRefresh.current) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [visible, online, load]);

  return { snapshot, loading, loadingMore, error, notice, cached, online, refresh: load, loadMore: () => load(true) };
}
