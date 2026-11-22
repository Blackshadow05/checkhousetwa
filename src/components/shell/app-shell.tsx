"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { checkCurrentUsuario, logoutUsuario } from "@/app/actions/usuarios";
import type { RetornoGoogle } from "@/components/auth/login-form";
import { InicioScreen, PublicInicioScreen, type InicioAccount } from "@/components/screens/inicio-screen";
import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { Fab, NewRevisionFab } from "@/components/shell/fab";
import { Header } from "@/components/shell/header";
import { AppNavigationProvider } from "@/components/shell/navigation-context";
import { RevisionDetailScreen } from "@/components/screens/revision-detail-screen";
import { RevisionFormScreen, type RevisionExitGuard } from "@/components/screens/revision-form-screen";
import { RevisionShareSheet } from "@/components/screens/revision-share-sheet";
import { RevisionesScreen } from "@/components/screens/revisiones-screen";
import { SyncScreen } from "@/components/screens/sync-screen";
import { OtrosScreen } from "@/components/screens/otros-screen";
import {
  RevisionesProvider,
  useRevisiones,
} from "@/components/screens/revisiones-provider";
import { useAppNavigation } from "@/lib/navigation/use-app-navigation";
import { SCREEN_ORDER, SCREENS, type ScreenId } from "@/lib/navigation/screens";
import type { InicioRevisionRow, MenuDelDia, UsuarioShell } from "@/types/database";
import type { RevisionActivity } from "@/lib/casitas-sin-revision";
import { newRevisionDraft, type RevisionMode } from "@/lib/revision-form";
import { restoreRevisionDraft, takeSavedRevisionDraft } from "@/hooks/use-revision-draft";
import { clearOfflineSession, loadOfflineSession, saveOfflineSession } from "@/lib/offline-session";
import { todayKey } from "@/lib/revisiones-display";

function subscribeToday(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

type AppShellProps = {
  initialUser?: UsuarioShell | null;
  offlineFallback?: boolean;
  initialScreen: ScreenId;
  revisionesInicio: InicioRevisionRow[];
  revisionesError: string | null;
  upsellsInicio: InicioRevisionRow[];
  revisionActivityInicio: RevisionActivity[] | null;
  activityError: string | null;
  menusInicio: MenuDelDia[];
  menusError: string | null;
  initialDay: string;
  retornoGoogle?: RetornoGoogle;
};

function AppShellFrame({
  navigation,
  menusInicio,
  menusError,
  account,
  session,
  entering,
  onEntered,
}: {
  entering: boolean;
  onEntered: () => void;
  account: InicioAccount;
  navigation: ReturnType<typeof useAppNavigation>;
  menusInicio: MenuDelDia[];
  menusError: string | null;
  session: UsuarioShell;
}) {
  const { selectedRevision, enviarRevision, pendientes, confirmadas } = useRevisiones();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<RevisionMode>("manual");
  const [shareEvidence, setShareEvidence] = useState<{ id: string; casita: string; files: File[] } | null>(null);
  const formVisible = formOpen && navigation.screen === "revisiones";
  const exitGuard = useRef<RevisionExitGuard | null>(null);
  const registerExitGuard = useCallback((guard: RevisionExitGuard | null) => { exitGuard.current = guard; }, []);
  const leaving = useRef(false);
  const formVisibleRef = useRef(formVisible);
  const formModeRef = useRef(formMode);
  useLayoutEffect(() => {
    formVisibleRef.current = formVisible;
    formModeRef.current = formMode;
  }, [formVisible, formMode]);
  useLayoutEffect(() => {
    const syncForm = (event?: Event) => {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      if (event?.type === "popstate" && formVisibleRef.current && params.get("nueva") !== "1" && !leaving.current
        && exitGuard.current?.(() => closeFormRef.current())) {
        params.set("nueva", "1");
        if (formModeRef.current === "reconocimiento") params.set("modo", "reconocimiento");
        else params.delete("modo");
        window.history.pushState({ ...window.history.state, casitaForm: true }, "", url);
        return;
      }
      if (params.get("nueva") === "1") leaving.current = false;
      setFormOpen(params.get("nueva") === "1");
      setFormMode(params.get("modo") === "reconocimiento" ? "reconocimiento" : "manual");
    };
    syncForm();
    window.addEventListener("popstate", syncForm);
    window.addEventListener("casitas:navigate", syncForm);
    return () => {
      window.removeEventListener("popstate", syncForm);
      window.removeEventListener("casitas:navigate", syncForm);
    };
  }, [navigation.screen]);
  const openForm = (mode: RevisionMode) => {
    leaving.current = false;
    const url = new URL(window.location.href);
    url.searchParams.set("nueva", "1");
    if (mode === "reconocimiento") url.searchParams.set("modo", mode);
    else url.searchParams.delete("modo");
    window.history.pushState({ ...window.history.state, casitaForm: true }, "", url);
    setFormMode(mode);
    setFormOpen(true);
  };
  const closeForm = useCallback(() => {
    leaving.current = true;
    setFormOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("nueva")) {
      if (window.history.state?.casitaForm) window.history.back();
      else {
        url.searchParams.delete("nueva");
        url.searchParams.delete("modo");
        window.history.replaceState(window.history.state, "", url);
      }
    }
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".new-revision-fab")?.focus({ preventScroll: true }));
  }, []);
  const closeFormRef = useRef(closeForm);
  const guardedNavigation = useMemo(() => ({
    screen: navigation.screen,
    navigate: (next: ScreenId) => {
      const leave = () => {
        const fromForm = formVisibleRef.current || new URLSearchParams(window.location.search).get("nueva") === "1";
        leaving.current = true;
        navigation.navigate(next, fromForm ? { replace: true } : undefined);
      };
      if (formVisibleRef.current && exitGuard.current?.(leave)) return;
      leave();
    },
  }), [navigation]);
  const screenElements = useRef<
    Partial<Record<ScreenId, HTMLDivElement | null>>
  >({});
  const savedScroll = useRef<Partial<Record<ScreenId, number>>>({});
  const [showTop, setShowTop] = useState<Partial<Record<ScreenId, boolean>>>(
    {},
  );
  const [fabAway, setFabAway] = useState(false);
  const [visibleView, setVisibleView] = useState({ screen: navigation.screen, formVisible });
  const lastScroll = useRef(0);

  if (visibleView.screen !== navigation.screen || visibleView.formVisible !== formVisible) {
    setVisibleView({ screen: navigation.screen, formVisible });
    if (fabAway) setFabAway(false);
  }

  useLayoutEffect(() => {
    if (formVisible) return;
    const id = navigation.screen;
    const element = screenElements.current[id];
    if (!element) return;
    const targetTop = savedScroll.current[id] ?? 0;
    if (element.scrollTop !== targetTop) {
      element.scrollTop = targetTop;
    }
    const actualTop = element.scrollTop;
    savedScroll.current[id] = actualTop;
    if (id === "revisiones") {
      lastScroll.current = actualTop;
    }
    const visible = actualTop > 500;
    const frame = requestAnimationFrame(() => {
      setShowTop((previous) =>
        previous[id] === visible ? previous : { ...previous, [id]: visible },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [formVisible, navigation.screen]);
  const screens = {
    otros: <OtrosScreen active={navigation.screen === "otros"} session={session} />,
    inicio: (
      <InicioScreen account={account} menus={menusInicio} menusError={menusError} />
    ),
    revisiones: <RevisionesScreen
      onContinuarGuardada={(draft) => {
        void takeSavedRevisionDraft(draft.id);
        restoreRevisionDraft(draft);
        openForm(draft.mode ?? "manual");
      }}
      onEditarPendiente={(draft) => {
        restoreRevisionDraft(draft);
        openForm(draft.mode ?? "manual");
      }}
      onCompletarPendiente={(row, mode) => {
        const draft = newRevisionDraft(mode);
        draft.values.casita = String(Number(row.casita));
        draft.completa = { id: row.id, marcadaPor: row.marcada_por ?? row.quien_revisa };
        restoreRevisionDraft(draft);
        openForm(mode);
      }}
    />,
    sync: <SyncScreen />,
  };
  const detailOpen = selectedRevision !== null;

  return (
    <div className={`app-shell${formVisible ? " is-creating-revision" : ""}`}>
      <div
        className={`app-shell-frame${entering ? " is-session-entering" : ""}`}
        inert={detailOpen ? true : undefined}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onEntered();
        }}
      >
        <Header />
        <main className="app-main">
          {SCREEN_ORDER.map((id) => (
            <div
              key={id}
              ref={(element) => {
                screenElements.current[id] = element;
              }}
              onScroll={(event) => {
                const element = event.currentTarget;
                const top = element.scrollTop;
                savedScroll.current[id] = top;
                if (id === "revisiones") {
                  const delta = top - lastScroll.current;
                  const atEdge = top < 80 || top + element.clientHeight >= element.scrollHeight - 24;
                  if (atEdge || Math.abs(delta) > 8) {
                    const away = !atEdge && delta > 0;
                    setFabAway((previous) => (previous === away ? previous : away));
                    lastScroll.current = top;
                  }
                }
                const visible = top > 500;
                setShowTop((previous) =>
                  previous[id] === visible
                    ? previous
                    : { ...previous, [id]: visible },
                );
              }}
              hidden={navigation.screen !== id || formVisible}
              inert={navigation.screen !== id || formVisible ? true : undefined}
              className="app-screen"
              aria-label={SCREENS[id].title}
              tabIndex={-1}
            >
              {screens[id]}
            </div>
          ))}
          <RevisionFormScreen open={formVisible} mode={formMode} reviewer={session.nombre} onExitGuard={registerExitGuard} onClose={closeForm} onQueued={(draft, reconocimiento, files) => {
            savedScroll.current.revisiones = 0;
            enviarRevision(draft, reconocimiento);
            closeForm();
            if (files.length) setShareEvidence({ id: draft.id, casita: String(Number(draft.values.casita)), files });
          }} />
          {navigation.screen === "revisiones" && !formVisible && !detailOpen && <NewRevisionFab away={fabAway} onSelect={openForm} />}
          {showTop[navigation.screen] && !formVisible && !detailOpen && (
            <Fab
              onClick={() =>
                screenElements.current[navigation.screen]?.scrollTo({
                  top: 0,
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "instant"
                    : "smooth",
                })
              }
            />
          )}
        </main>
        <AppNavigationProvider value={guardedNavigation}>
          <BottomNavigation />
        </AppNavigationProvider>
      </div>
      {selectedRevision && (
        <RevisionDetailScreen key={selectedRevision.id} usuario={session} />
      )}
      {shareEvidence && <RevisionShareSheet casita={shareEvidence.casita} files={shareEvidence.files} status={pendientes.find((item) => item.draft.id === shareEvidence.id)?.status ?? (confirmadas.has(shareEvidence.id) ? "saved" : "error")} onClose={() => {
        setShareEvidence(null);
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".new-revision-fab")?.focus({ preventScroll: true }));
      }} />}
    </div>
  );
}

export function AppShell({
  initialUser = null,
  offlineFallback = false,
  initialScreen,
  revisionesInicio,
  revisionesError,
  upsellsInicio,
  revisionActivityInicio,
  activityError,
  menusInicio,
  menusError,
  initialDay,
  retornoGoogle,
}: AppShellProps) {
  const navigation = useAppNavigation(initialScreen);
  const router = useRouter();
  const liveDay = useSyncExternalStore(subscribeToday, todayKey, () => initialDay);
  const [user, setUser] = useState(initialUser);
  const [previousInitialUser, setPreviousInitialUser] = useState(initialUser);
  const [restoringOffline, setRestoringOffline] = useState(Boolean(offlineFallback && !initialUser));
  const [restoredFromOffline, setRestoredFromOffline] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [entering, setEntering] = useState(false);
  const sessionGeneration = useRef(0);

  if (previousInitialUser !== initialUser) {
    setPreviousInitialUser(initialUser);
    setUser(initialUser);
    setRestoredFromOffline(false);
    if (initialUser) setRestoringOffline(false);
  }

  useEffect(() => {
    if (!offlineFallback || initialUser) return;
    let cancelled = false;
    void loadOfflineSession().then((cachedUser) => {
      if (cancelled) return;
      if (cachedUser) {
        setRestoredFromOffline(true);
        setUser(cachedUser);
      }
      setRestoringOffline(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialUser, offlineFallback]);

  useEffect(() => {
    if (restoringOffline) return;
    if (user && !restoredFromOffline) {
      void saveOfflineSession(user);
      return;
    }
    if (!user && !offlineFallback) {
      void clearOfflineSession();
    }
  }, [offlineFallback, restoredFromOffline, restoringOffline, user]);

  useEffect(() => {
    // The initial session was checked on the server. Anonymous polling competes
    // with login/MFA in Next's sequential Server Action queue.
    if (!user) return;
    let live = true;
    let checking = false;
    let lastCheck = restoredFromOffline ? 0 : Date.now();
    const check = async () => {
      if (checking || !navigator.onLine || document.visibilityState !== "visible" || Date.now() - lastCheck < 15_000) return;
      checking = true;
      lastCheck = Date.now();
      const generation = sessionGeneration.current;
      try {
        const result = await checkCurrentUsuario();
        if (!live || !navigator.onLine || generation !== sessionGeneration.current) return;
        if (result.status === "inactive") {
          void clearOfflineSession();
          setRestoredFromOffline(false);
          setUser(null);
        } else if (result.status === "active") {
          setRestoredFromOffline(false);
          void saveOfflineSession(result.user);
          setUser((previous) =>
            previous &&
            previous.id === result.user.id &&
            previous.nombre === result.user.nombre &&
            previous.rol === result.user.rol
              ? previous
              : result.user,
          );
        }
      } catch {
        // Transport errors do not confirm a logout. Server actions continue to
        // enforce authorization; retry the check when connectivity returns.
      } finally {
        checking = false;
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    const onLogout = () => {
      void clearOfflineSession();
      setRestoredFromOffline(false);
      setUser(null);
      router.refresh();
    };
    if (restoredFromOffline && navigator.onLine && document.visibilityState === "visible") {
      void check();
    }
    const timer = window.setInterval(() => void check(), 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("casitas:logout", onLogout);
    window.addEventListener("online", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("casitas:logout", onLogout);
      window.removeEventListener("online", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [restoredFromOffline, router, user]);

  if (restoringOffline) return (
    <div className="app-shell">
      <div className="app-shell-frame">
        <header className="app-header">
          <div className="header-inner">
            <div className="app-brand">
              <span className="brand-mark">
                <Image src="/icons/icon-192.png" alt="" width={44} height={44} priority />
              </span>
              <p className="brand-name">Casitas</p>
            </div>
          </div>
        </header>
        <main className="app-main">
          <div className="app-screen">
            <p className="sr-only" role="status">Cargando tu sesión guardada…</p>
          </div>
        </main>
      </div>
    </div>
  );

  if (!user) return (
    <div className="app-shell">
      <div className="app-shell-frame">
        <header className="app-header">
          <div className="header-inner">
            <div className="app-brand">
              <span className="brand-mark">
                <Image src="/icons/icon-192.png" alt="" width={44} height={44} priority />
              </span>
              <p className="brand-name">Casitas</p>
            </div>
          </div>
        </header>
        <PublicInicioScreen menus={menusInicio} menusError={menusError} today={liveDay} retornoGoogle={retornoGoogle} onSuccess={(authenticatedUser) => {
          sessionGeneration.current += 1;
          setRestoredFromOffline(false);
          setEntering(true);
          setUser(authenticatedUser);
          void saveOfflineSession(authenticatedUser);
          router.refresh();
        }} />
      </div>
    </div>
  );

  return (
    <AppNavigationProvider value={navigation}>
      <RevisionesProvider
        initialRows={revisionesInicio}
        initialUpsells={upsellsInicio}
        initialRevisionActivity={revisionActivityInicio}
        initialActivityError={activityError}
        initialError={revisionesError}
        initialDay={liveDay}
      >
        <AppShellFrame
          account={{
            nombre: user.nombre,
            rol: user.rol,
            loggingOut,
            error: sessionError,
            onLogout: async () => {
              setLoggingOut(true);
              setSessionError("");
              try {
                await logoutUsuario();
                void clearOfflineSession();
                setRestoredFromOffline(false);
                setUser(null);
                router.refresh();
              } catch { setSessionError("No se pudo cerrar sesión. Vuelve a intentarlo."); }
              finally { setLoggingOut(false); }
            },
          }}
          navigation={navigation}
          menusInicio={menusInicio}
          menusError={menusError}
          session={user}
          entering={entering}
          onEntered={() => setEntering(false)}
        />
      </RevisionesProvider>
    </AppNavigationProvider>
  );
}
