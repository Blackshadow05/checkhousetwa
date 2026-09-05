"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchInicioRevisiones } from "@/app/actions/revisiones";
import { REVISIONES_TABLE } from "@/lib/constants";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { todayKey } from "@/lib/revisiones-display";
import { applyRealtimeChange } from "@/lib/revisiones-map";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useOnline } from "@/lib/use-online";
import type { InicioRevisionRow, RevisionCasita } from "@/types/database";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

type Snapshot = { id: "inicio"; rows: InicioRevisionRow[]; savedAt: string };
type RefreshOptions = { force?: boolean };
type RevisionState = {
  revisiones: InicioRevisionRow[];
  error: string | null;
  refreshing: boolean;
  savedAt: string | null;
  localAvailable: boolean;
  storageError: boolean;
  online: boolean;
  today: string;
  selectedRevision: InicioRevisionRow | null;
  openRevision: (row: InicioRevisionRow) => void;
  closeRevision: () => void;
  refresh: (options?: RefreshOptions) => Promise<boolean>;
};
const Context = createContext<RevisionState | null>(null);

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const LEFT_APP_MS = 2_000;

export function RevisionesProvider({
  children,
  initialRows,
  initialError,
  initialDay,
}: {
  children: ReactNode;
  initialRows: InicioRevisionRow[];
  initialError: string | null;
  initialDay: string;
}) {
  const [revisiones, setRevisiones] = useState(initialRows);
  const [error, setError] = useState(initialError);
  const [refreshing, setRefreshing] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [localAvailable, setLocalAvailable] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [today, setToday] = useState(initialDay);
  const [selectedRevision, setSelectedRevision] =
    useState<InicioRevisionRow | null>(null);
  const online = useOnline();
  const inFlight = useRef(false);
  const generation = useRef(0);
  const revisionesRef = useRef(revisiones);
  const initialRowsRef = useRef(initialRows);
  const initialErrorRef = useRef(initialError);
  const lastFetchedAt = useRef(Date.now());
  const lastHiddenAt = useRef(0);
  const leftTheApp = useRef(false);
  const wasOffline = useRef(false);
  const pendingForce = useRef<boolean | null>(null);
  const selectedRevisionRef = useRef(selectedRevision);

  useEffect(() => {
    revisionesRef.current = revisiones;
  }, [revisiones]);

  useEffect(() => {
    selectedRevisionRef.current = selectedRevision;
  }, [selectedRevision]);

  initialRowsRef.current = initialRows;
  initialErrorRef.current = initialError;

  const openRevision = useCallback((row: InicioRevisionRow) => {
    setSelectedRevision(row);
    if (!row.id) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("r") === row.id) return;
      url.searchParams.set("r", row.id);
      window.history.pushState(
        { ...window.history.state, casitaRevision: row.id },
        "",
        url.toString(),
      );
    } catch {
      return;
    }
  }, []);

  const closeRevision = useCallback(() => {
    setSelectedRevision(null);
    try {
      const url = new URL(window.location.href);
      const historyState = window.history.state as {
        casitaRevision?: string;
      } | null;
      if (!url.searchParams.has("r") && !historyState?.casitaRevision) {
        return;
      }
      if (historyState?.casitaRevision) {
        window.history.back();
        return;
      }
      url.searchParams.delete("r");
      window.history.replaceState(
        { ...window.history.state, casitaRevision: null },
        "",
        url.toString(),
      );
    } catch {
      return;
    }
  }, []);

  const persist = useCallback(async (rows: InicioRevisionRow[]) => {
    const savedAt = new Date().toISOString();
    try {
      await idbPut<Snapshot>(IDB_STORES.snapshots, {
        id: "inicio",
        rows,
        savedAt,
      });
      setSavedAt(savedAt);
      setLocalAvailable(true);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  const refresh = useCallback(
    async ({ force = true }: RefreshOptions = {}) => {
      setToday(todayKey());
      if (!navigator.onLine) return false;
      if (inFlight.current) {
        pendingForce.current = Boolean(force || pendingForce.current);
        return false;
      }
      if (!force && Date.now() - lastFetchedAt.current < AUTO_REFRESH_MS) {
        return true;
      }
      inFlight.current = true;
      generation.current += 1;
      setRefreshing(true);
      try {
        const result = await fetchInicioRevisiones();
        if (result.error) {
          setError(
            "No pudimos actualizar las revisiones. Puedes volver a intentarlo.",
          );
          return false;
        }
        lastFetchedAt.current = Date.now();
        setRevisiones(result.revisiones);
        setError(null);
        await persist(result.revisiones);
        return true;
      } catch {
        setError("No pudimos conectar. Tus revisiones guardadas siguen aquí.");
        return false;
      } finally {
        inFlight.current = false;
        setRefreshing(false);
        if (pendingForce.current !== null) {
          const nextForce = pendingForce.current;
          pendingForce.current = null;
          void refresh({ force: nextForce });
        }
      }
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    let reconnectRetry: number | undefined;
    const currentGeneration = generation.current;
    const restore = async () => {
      try {
        const cached = await idbGet<Snapshot>(IDB_STORES.snapshots, "inicio");
        if (cancelled || generation.current !== currentGeneration) return;
        setToday(todayKey());
        if (cached) {
          setSavedAt(cached.savedAt);
          setLocalAvailable(true);
          if (initialErrorRef.current || !navigator.onLine) {
            setRevisiones(cached.rows);
          }
        }
        if (!initialErrorRef.current && navigator.onLine) {
          await persist(initialRowsRef.current);
        }
      } catch {
        if (!cancelled) setStorageError(true);
      }
    };
    void restore();
    wasOffline.current = !navigator.onLine;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        leftTheApp.current = true;
        lastHiddenAt.current = Date.now();
        return;
      }
      if (document.visibilityState !== "visible" || !leftTheApp.current) {
        return;
      }
      leftTheApp.current = false;
      if (Date.now() - lastHiddenAt.current < LEFT_APP_MS) return;
      void refresh({ force: false });
    };
    const onOffline = () => {
      wasOffline.current = true;
    };
    const onOnline = async () => {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      window.clearTimeout(reconnectRetry);
      const updated = await refresh();
      if (!updated && !cancelled) {
        reconnectRetry = window.setTimeout(() => {
          void refresh();
        }, 1500);
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void refresh({ force: false });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const midnightCheck = window.setInterval(
      () => setToday(todayKey()),
      60_000,
    );
    const syncFromUrl = () => {
      const id = new URL(window.location.href).searchParams.get("r");
      if (!id) {
        setSelectedRevision(null);
        return;
      }
      const row = revisionesRef.current.find((item) => item.id === id);
      if (row) setSelectedRevision(row);
    };
    window.addEventListener("popstate", syncFromUrl);
    syncFromUrl();
    return () => {
      cancelled = true;
      window.clearInterval(midnightCheck);
      window.clearTimeout(reconnectRetry);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", syncFromUrl);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist, refresh]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let persistTimer: number | undefined;
    let missedEvents = false;

    const queuePersist = (rows: InicioRevisionRow[]) => {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => {
        void persist(rows);
      }, 320);
    };

    const onChange = (
      payload: RealtimePostgresChangesPayload<RevisionCasita>,
    ) => {
      const next = applyRealtimeChange(
        revisionesRef.current,
        payload.eventType,
        payload.new,
        payload.old,
      );
      revisionesRef.current = next;
      setRevisiones(next);
      setToday(todayKey());
      setError(null);
      lastFetchedAt.current = Date.now();
      const open = selectedRevisionRef.current;
      if (open?.id) {
        const match = next.find((row) => row.id === open.id);
        if (match) setSelectedRevision(match);
        else closeRevision();
      }
      queuePersist(next);
    };

    const connect = async () => {
      try {
        const supabase = await getBrowserSupabase();
        if (cancelled) return;
        channel = supabase
          .channel("inicio-revisiones")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: REVISIONES_TABLE },
            onChange,
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && missedEvents) {
              missedEvents = false;
              void refresh({ force: true });
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              missedEvents = true;
            }
          });
      } catch {
        missedEvents = true;
      }
    };

    void connect();
    return () => {
      cancelled = true;
      window.clearTimeout(persistTimer);
      if (channel) void channel.unsubscribe();
    };
  }, [closeRevision, online, persist, refresh]);

  return (
    <Context.Provider
      value={{
        revisiones,
        error,
        refreshing,
        savedAt,
        localAvailable,
        storageError,
        online,
        today,
        selectedRevision,
        openRevision,
        closeRevision,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useRevisiones() {
  const value = useContext(Context);
  if (!value) throw new Error("RevisionesProvider is required");
  return value;
}
