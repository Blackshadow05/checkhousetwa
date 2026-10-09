"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRevision, fetchCanalRevisiones, fetchInicioRevisiones } from "@/app/actions/revisiones";
import { applyRevisionActivityChange, type RevisionActivity } from "@/lib/casitas-sin-revision";
import { runDetailTransition } from "@/lib/detail-transition";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { todayKey } from "@/lib/revisiones-display";
import { applyUpsellChange } from "@/lib/revisiones-map";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { discardUpload, releaseUploads, resolveEvidenciaUrls } from "@/lib/revision-evidence-upload";
import { loadOutbox, pendingRevisionRow, storeOutbox, type PendingRevision } from "@/lib/revision-outbox";
import type { RevisionDraft } from "@/lib/revision-form";
import { prepararSonidoGuardado, sonarGuardado } from "@/lib/sonido-guardado";
import type { RevisionRecognitionInput } from "@/lib/revision-recognition-log";
import { useOnline } from "@/lib/use-online";
import type { InicioRevisionRow } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  replaceRevision: (row: InicioRevisionRow) => void;
  revisionPatch: InicioRevisionRow | null;
  pendientes: PendingRevision[];
  enviarRevision: (draft: RevisionDraft, reconocimiento: RevisionRecognitionInput | null) => void;
  reintentarRevision: (id: string) => void;
  tomarRevision: (id: string) => PendingRevision | null;
  descartarRevision: (id: string) => void;
};
const Context = createContext<RevisionState | null>(null);

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const LEFT_APP_MS = 2_000;
const CHANGE_DEBOUNCE_MS = 250;
const CHANNEL_RETRY_MS = 30_000;

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
  const [revisionPatch, setRevisionPatch] = useState<InicioRevisionRow | null>(null);
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
  const [pendientes, setPendientes] = useState<PendingRevision[]>([]);
  const pendientesRef = useRef<PendingRevision[]>([]);
  const sendingRef = useRef(new Set<string>());

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

  const showRevision = useCallback(
    (next: InicioRevisionRow | null, animate = true) => {
      const current = selectedRevisionRef.current;
      const apply = () => {
        selectedRevisionRef.current = next;
        setSelectedRevision(next);
      };
      const id = next?.id || current?.id;
      if (!animate || !id || Boolean(current) === Boolean(next)) {
        apply();
        return;
      }
      runDetailTransition(id, next !== null, apply);
    },
    [],
  );

  const openRevision = useCallback((row: InicioRevisionRow) => {
    if (pendientesRef.current.some((item) => item.draft.id === row.id)) return;
    showRevision(row);
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
  }, [showRevision]);

  const closeRevision = useCallback(() => {
    showRevision(null);
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
  }, [showRevision]);

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

  const replaceRevision = useCallback((row: InicioRevisionRow) => {
    if (!row.id) return;
    generation.current += 1;
    if (inFlight.current) pendingForce.current = true;
    const next = revisionesRef.current.some((item) => item.id === row.id)
      ? revisionesRef.current.map((item) => (item.id === row.id ? row : item))
      : revisionesRef.current;
    const nextUpsells = applyUpsellChange(upsellsRef.current, "UPDATE", row, { id: row.id });
    const nextActivity = applyRevisionActivityChange(
      activityRef.current,
      "UPDATE",
      { id: row.id, casita: row.casita, created_at: row.created_at },
      { id: row.id },
      todayKey(),
    );
    revisionesRef.current = next;
    upsellsRef.current = nextUpsells;
    activityRef.current = nextActivity;
    knownRowsRef.current.set(row.id, row);
    setRevisiones(next);
    setUpsells(nextUpsells);
    setRevisionActivity(nextActivity);
    setRevisionPatch(row);
    if (selectedRevisionRef.current?.id === row.id) setSelectedRevision(row);
    void persist(next, nextUpsells);
  }, [persist]);

  const writePendientes = useCallback((change: (items: PendingRevision[]) => PendingRevision[]) => {
    const next = change(pendientesRef.current);
    pendientesRef.current = next;
    setPendientes(next);
    void storeOutbox(next).catch(() => setStorageError(true));
  }, []);

  const marcarPendiente = useCallback((id: string, status: PendingRevision["status"], error: string | null = null) => {
    writePendientes((items) => items.map((item) => item.draft.id === id ? { ...item, status, error } : item));
  }, [writePendientes]);

  const sendPendiente = useCallback(async (id: string) => {
    const item = pendientesRef.current.find((entry) => entry.draft.id === id);
    if (!item || sendingRef.current.has(id)) return;
    if (!navigator.onLine) {
      marcarPendiente(id, "waiting");
      return;
    }
    sendingRef.current.add(id);
    marcarPendiente(id, "saving");
    try {
      const { draft } = item;
      let paths: string[] = [];
      if (draft.photos.length) {
        try {
          paths = await resolveEvidenciaUrls(draft.photos);
        } catch {
          marcarPendiente(id, navigator.onLine ? "error" : "waiting", "No pudimos subir una evidencia. Conservamos la revisión para reintentar.");
          return;
        }
      }
      const result = await createRevision({ id, values: draft.values, photos: paths, reconocimiento: item.reconocimiento });
      if (!result.row) {
        marcarPendiente(id, "error", result.error ?? "No pudimos confirmar el guardado.");
        return;
      }
      releaseUploads(draft.photos.map((photo) => photo.id));
      writePendientes((items) => items.filter((entry) => entry.draft.id !== id));
      acceptRevision(result.row);
      sonarGuardado();
    } catch {
      marcarPendiente(id, navigator.onLine ? "error" : "waiting", "No pudimos conectar para guardar. Conservamos la revisión para reintentar.");
    } finally {
      sendingRef.current.delete(id);
    }
  }, [acceptRevision, marcarPendiente, writePendientes]);

  const enviarRevision = useCallback((draft: RevisionDraft, reconocimiento: RevisionRecognitionInput | null) => {
    prepararSonidoGuardado();
    const entry: PendingRevision = { draft, reconocimiento, row: pendingRevisionRow(draft), status: "saving", error: null };
    writePendientes((items) => [entry, ...items.filter((item) => item.draft.id !== draft.id)]);
    void sendPendiente(draft.id);
  }, [sendPendiente, writePendientes]);

  const reintentarRevision = useCallback((id: string) => {
    prepararSonidoGuardado();
    void sendPendiente(id);
  }, [sendPendiente]);

  const tomarRevision = useCallback((id: string) => {
    if (sendingRef.current.has(id)) return null;
    const item = pendientesRef.current.find((entry) => entry.draft.id === id) ?? null;
    if (item) writePendientes((items) => items.filter((entry) => entry.draft.id !== id));
    return item;
  }, [writePendientes]);

  const descartarRevision = useCallback((id: string) => {
    const item = tomarRevision(id);
    for (const photo of item?.draft.photos ?? []) void discardUpload(photo.id);
  }, [tomarRevision]);

  useEffect(() => {
    let cancelled = false;
    void loadOutbox().then((saved) => {
      if (cancelled || !saved.length) return;
      const known = new Set(pendientesRef.current.map((item) => item.draft.id));
      const restored = saved.filter((item) => !known.has(item.draft.id))
        .map((item) => ({ ...item, status: navigator.onLine ? "saving" as const : "waiting" as const }));
      if (!restored.length) return;
      writePendientes((items) => [...items, ...restored]);
      for (const item of restored) void sendPendiente(item.draft.id);
    }).catch(() => {});
    const onOnline = () => {
      for (const item of pendientesRef.current) {
        if (item.status !== "saving") void sendPendiente(item.draft.id);
      }
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [sendPendiente, writePendientes]);

  const visibles = useMemo(() => {
    if (!pendientes.length) return revisiones;
    const ids = new Set(pendientes.map((item) => item.draft.id));
    return [...pendientes.map((item) => item.row), ...revisiones.filter((row) => !ids.has(row.id))]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [pendientes, revisiones]);

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
      const startedGeneration = generation.current;
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
        const open = selectedRevisionRef.current;
        const fresh = open?.id && generation.current === startedGeneration
          ? result.revisiones.find((row) => row.id === open.id) ??
            result.upsells.find((row) => row.id === open.id)
          : undefined;
        if (fresh) {
          knownRowsRef.current.set(fresh.id, fresh);
          selectedRevisionRef.current = fresh;
          setSelectedRevision(fresh);
        }
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
    const onDeleted = (event: Event) => {
      const ids = new Set((event as CustomEvent<string[]>).detail);
      generation.current += 1;
      if (inFlight.current) pendingForce.current = true;
      const next = revisionesRef.current.filter(row => !ids.has(row.id));
      const nextUpsells = upsellsRef.current.filter(row => !ids.has(row.id));
      revisionesRef.current = next; upsellsRef.current = nextUpsells;
      setRevisiones(next); setUpsells(nextUpsells);
      // Reload room activity: removing the latest revision can reveal an older one.
      activityRef.current = null; setRevisionActivity(null);
      for (const id of ids) knownRowsRef.current.delete(id);
      if (selectedRevisionRef.current && ids.has(selectedRevisionRef.current.id)) setSelectedRevision(null);
      void persist(next, nextUpsells);
      void refreshRef.current?.({ force: true });
    };
    window.addEventListener("casitas:revisiones-eliminadas", onDeleted);
    return () => window.removeEventListener("casitas:revisiones-eliminadas", onDeleted);
  }, [persist]);

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
    const syncFromUrl = (fromPop = false, animate = false) => {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("r");
      if (!id) {
        showRevision(null, animate);
        return;
      }
      const marked =
        (window.history.state as { casitaRevision?: string } | null)
          ?.casitaRevision;
      if (fromPop && !marked) {
        url.searchParams.delete("r");
        window.history.replaceState(
          { ...window.history.state, casitaRevision: null },
          "",
          url.toString(),
        );
        showRevision(null, animate);
        return;
      }
      const row =
        revisionesRef.current.find((item) => item.id === id) ??
        upsellsRef.current.find((item) => item.id === id) ??
        knownRowsRef.current.get(id);
      if (row) showRevision(row, animate);
    };
    const onPopState = (event: PopStateEvent) =>
      syncFromUrl(true, !event.hasUAVisualTransition);
    window.addEventListener("popstate", onPopState);
    syncFromUrl();
    return () => {
      cancelled = true;
      window.clearInterval(midnightCheck);
      window.clearTimeout(reconnectRetry);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persist, refresh, showRevision]);

  useEffect(() => {
    if (!online) return;
    const initialRefresh = window.setTimeout(() => void refresh({ force: true }), 0);
    return () => window.clearTimeout(initialRefresh);
  }, [online, refresh]);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let supabase: Awaited<ReturnType<typeof getBrowserSupabase>> | null = null;
    let changeTimer: number | undefined;
    let retryTimer: number | undefined;
    let missedEvents = false;

    const onChange = () => {
      window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => {
        void refreshRef.current?.({ force: true });
      }, CHANGE_DEBOUNCE_MS);
    };

    const connect = async () => {
      try {
        const [client, topic] = await Promise.all([
          getBrowserSupabase(),
          fetchCanalRevisiones(),
        ]);
        if (cancelled) return;
        if (!topic) {
          retryTimer = window.setTimeout(() => void connect(), CHANNEL_RETRY_MS);
          return;
        }
        supabase = client;
        channel = client
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "cambio" }, onChange)
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              if (missedEvents) {
                missedEvents = false;
                onChange();
              }
              return;
            }
            missedEvents = true;
          });
      } catch {
        if (!cancelled) {
          retryTimer = window.setTimeout(() => void connect(), CHANNEL_RETRY_MS);
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      window.clearTimeout(changeTimer);
      window.clearTimeout(retryTimer);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [online]);

  return (
    <Context.Provider
      value={{
        revisiones: visibles,
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
        replaceRevision,
        revisionPatch,
        pendientes,
        enviarRevision,
        reintentarRevision,
        tomarRevision,
        descartarRevision,
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
