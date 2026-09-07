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
import { applyRevisionActivityChange, type RevisionActivity } from "@/lib/casitas-sin-revision";
import { REVISIONES_TABLE } from "@/lib/constants";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { todayKey } from "@/lib/revisiones-display";
import { applyRealtimeChange, applyUpsellChange, mapInicioRevision } from "@/lib/revisiones-map";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useOnline } from "@/lib/use-online";
import type { InicioRevisionRow, RevisionCasita, RevisionCasitaInicio } from "@/types/database";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

type Snapshot = {
  id: "inicio";
  rows: InicioRevisionRow[];
  upsells?: InicioRevisionRow[];
  revisionActivity?: RevisionActivity[] | null;
  savedAt: string;
};
type RefreshOptions = { force?: boolean };
type RevisionState = {
  revisiones: InicioRevisionRow[];
  upsells: InicioRevisionRow[];
  revisionActivity: RevisionActivity[] | null;
  activityError: string | null;
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
  rememberRevisiones: (rows: InicioRevisionRow[]) => void;
  acceptRevision: (row: InicioRevisionRow) => void;
};
const Context = createContext<RevisionState | null>(null);

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const LEFT_APP_MS = 2_000;

export function RevisionesProvider({
  children,
  initialRows,
  initialUpsells,
  initialRevisionActivity,
  initialActivityError,
  initialError,
  initialDay,
}: {
  children: ReactNode;
  initialRows: InicioRevisionRow[];
  initialUpsells: InicioRevisionRow[];
  initialRevisionActivity: RevisionActivity[] | null;
  initialActivityError: string | null;
  initialError: string | null;
  initialDay: string;
}) {
  const [revisiones, setRevisiones] = useState(initialRows);
  const [upsells, setUpsells] = useState(initialUpsells);
  const [revisionActivity, setRevisionActivity] = useState(initialRevisionActivity);
  const [activityError, setActivityError] = useState(initialActivityError);
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
  const upsellsRef = useRef(upsells);
  const activityRef = useRef(revisionActivity);
  const initialActivityRef = useRef(initialRevisionActivity);
  const initialErrorRef = useRef(initialError);
  const lastFetchedAt = useRef(0);
  const lastHiddenAt = useRef(0);
  const leftTheApp = useRef(false);
  const wasOffline = useRef(false);
  const pendingForce = useRef<boolean | null>(null);
  const refreshRef = useRef<RevisionState["refresh"] | null>(null);
  const selectedRevisionRef = useRef(selectedRevision);
  const knownRowsRef = useRef(new Map<string, InicioRevisionRow>());

  useEffect(() => {
    revisionesRef.current = revisiones;
  }, [revisiones]);

  useEffect(() => {
    upsellsRef.current = upsells;
  }, [upsells]);

  useEffect(() => {
    selectedRevisionRef.current = selectedRevision;
  }, [selectedRevision]);

  useEffect(() => {
    initialActivityRef.current = initialRevisionActivity;
    initialErrorRef.current = initialError;
    if (lastFetchedAt.current === 0 && !initialError && !initialActivityError) {
      lastFetchedAt.current = Date.now();
    }
  }, [initialRevisionActivity, initialError, initialActivityError]);

  const openRevision = useCallback((row: InicioRevisionRow) => {
    setSelectedRevision(row);
    if (row.id) knownRowsRef.current.set(row.id, row);
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

  const rememberRevisiones = useCallback((rows: InicioRevisionRow[]) => {
    for (const row of rows) {
      if (row.id) knownRowsRef.current.set(row.id, row);
    }
  }, []);

  const persist = useCallback(
    async (rows: InicioRevisionRow[], nextUpsells?: InicioRevisionRow[]) => {
      const savedAt = new Date().toISOString();
      const upsellsToSave = nextUpsells ?? upsellsRef.current;
      try {
        await idbPut<Snapshot>(IDB_STORES.snapshots, {
          id: "inicio",
          rows,
          upsells: upsellsToSave,
          revisionActivity: activityRef.current,
          savedAt,
        });
        setSavedAt(savedAt);
        setLocalAvailable(true);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    },
    [],
  );

  const acceptRevision = useCallback((row: InicioRevisionRow) => {
    generation.current += 1;
    if (inFlight.current) pendingForce.current = true;
    const next = [row, ...revisionesRef.current.filter((item) => item.id !== row.id)]
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
    const nextUpsells = applyUpsellChange(upsellsRef.current, "INSERT", row, null);
    const nextActivity = applyRevisionActivityChange(activityRef.current, "INSERT", row, null, todayKey());
    revisionesRef.current = next;
    upsellsRef.current = nextUpsells;
    activityRef.current = nextActivity;
    knownRowsRef.current.set(row.id, row);
    setRevisiones(next);
    setUpsells(nextUpsells);
    setRevisionActivity(nextActivity);
    void persist(next, nextUpsells);
  }, [persist]);

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
        if (result.revisionActivity !== null) {
          activityRef.current = result.revisionActivity;
          setRevisionActivity(result.revisionActivity);
        }
        setActivityError(result.activityError);
        if (result.error) {
          setError(
            "No pudimos actualizar las revisiones. Puedes volver a intentarlo.",
          );
          if (result.revisionActivity !== null) await persist(revisionesRef.current, upsellsRef.current);
          return false;
        }
        if (!result.activityError) lastFetchedAt.current = Date.now();
        revisionesRef.current = result.revisiones;
        upsellsRef.current = result.upsells;
        setRevisiones(result.revisiones);
        setUpsells(result.upsells);
        setError(null);
        await persist(result.revisiones, result.upsells);
        return !result.activityError;
      } catch {
        setActivityError("No se pudo actualizar la actividad de revisiones");
        setError("No pudimos conectar. Tus revisiones guardadas siguen aquí.");
        return false;
      } finally {
        inFlight.current = false;
        setRefreshing(false);
        if (pendingForce.current !== null) {
          const nextForce = pendingForce.current;
          pendingForce.current = null;
          void refreshRef.current?.({ force: nextForce });
        }
      }
    },
    [persist],
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

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
            revisionesRef.current = cached.rows;
            setRevisiones(cached.rows);
            if (cached.upsells) {
              upsellsRef.current = cached.upsells;
              setUpsells(cached.upsells);
            }
          }
          if (initialActivityRef.current === null || !navigator.onLine) {
            activityRef.current = cached.revisionActivity ?? null;
            setRevisionActivity(cached.revisionActivity ?? null);
          }
        }
        if (navigator.onLine && (!initialErrorRef.current || initialActivityRef.current !== null)) {
          await persist(revisionesRef.current, upsellsRef.current);
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
      const row =
        revisionesRef.current.find((item) => item.id === id) ??
        upsellsRef.current.find((item) => item.id === id) ??
        knownRowsRef.current.get(id);
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

    const queuePersist = () => {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => {
        void persist(revisionesRef.current, upsellsRef.current);
      }, 320);
    };

    const onChange = (
      payload: RealtimePostgresChangesPayload<RevisionCasita>,
    ) => {
      generation.current += 1;
      if (inFlight.current) pendingForce.current = true;
      const next = applyRealtimeChange(
        revisionesRef.current,
        payload.eventType,
        payload.new,
        payload.old,
      );
      const nextUpsells = applyUpsellChange(
        upsellsRef.current,
        payload.eventType,
        payload.new,
        payload.old,
      );
      const nextActivity = applyRevisionActivityChange(
        activityRef.current,
        payload.eventType,
        payload.new,
        payload.old,
        todayKey(),
      );
      revisionesRef.current = next;
      upsellsRef.current = nextUpsells;
      activityRef.current = nextActivity;
      setRevisiones(next);
      setUpsells(nextUpsells);
      setRevisionActivity(nextActivity);
      setToday(todayKey());
      setError(null);
      const open = selectedRevisionRef.current;
      if (open?.id) {
        if (payload.eventType === "DELETE") {
          const deleted =
            payload.old &&
            typeof payload.old === "object" &&
            "id" in payload.old &&
            typeof payload.old.id === "string"
              ? payload.old.id
              : null;
          if (deleted === open.id) {
            knownRowsRef.current.delete(open.id);
            closeRevision();
          }
        } else if (
          payload.new &&
          typeof payload.new === "object" &&
          "id" in payload.new &&
          payload.new.id === open.id
        ) {
          const mapped = mapInicioRevision(
            payload.new as RevisionCasitaInicio,
          );
          knownRowsRef.current.set(mapped.id, mapped);
          setSelectedRevision(mapped);
        } else {
          const match =
            next.find((row) => row.id === open.id) ??
            nextUpsells.find((row) => row.id === open.id) ??
            knownRowsRef.current.get(open.id);
          if (match) setSelectedRevision(match);
        }
      }
      queuePersist();
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
        upsells,
        revisionActivity,
        activityError,
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
        rememberRevisiones,
        acceptRevision,
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
