"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHorarios } from "@/app/actions/horarios";
import type { HorariosSnapshot } from "@/lib/horarios";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { useOnline } from "@/lib/use-online";

export function useHorarios(visible: boolean, ownerId: number) {
  const [snapshot, setSnapshot] = useState<HorariosSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cached, setCached] = useState(true);
  const fetching = useRef(false);
  const mounted = useRef(false);
  const online = useOnline();
  const cacheId = `horarios-v1-${ownerId}`;

  useEffect(() => {
    mounted.current = true;
    let live = true;
    void idbGet<HorariosSnapshot>(IDB_STORES.snapshots, cacheId).then(data => {
      if (live && data?.ownerId === ownerId) setSnapshot(previous => previous || data);
    }).catch(() => {});
    return () => { live = false; mounted.current = false; };
  }, [cacheId, ownerId]);

  const refresh = useCallback(async () => {
    if (fetching.current || !navigator.onLine) return;
    fetching.current = true;
    setLoading(true);
    try {
      const result = await fetchHorarios();
      if (!mounted.current) return;
      if (!result.snapshot || result.snapshot.ownerId !== ownerId) {
        setError(result.error || "La sesión cambió. Vuelve a abrir los horarios.");
        return;
      }
      setSnapshot(result.snapshot); setCached(false); setError(""); setNotice("");
      await idbPut(IDB_STORES.snapshots, { id: cacheId, ...result.snapshot }).catch(() => {
        if (mounted.current) setNotice("Datos actualizados. No se pudo guardar una copia sin conexión en este dispositivo.");
      });
    } catch {
      if (mounted.current) setError("No se pudo actualizar. Conservamos los últimos datos disponibles.");
    } finally {
      fetching.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [cacheId, ownerId]);

  useEffect(() => {
    if (!visible || !online) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [visible, online, refresh]);

  return { snapshot, loading, error, notice, cached, online, refresh };
}
