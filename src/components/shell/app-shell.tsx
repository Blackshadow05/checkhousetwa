"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { currentUsuario, logoutUsuario } from "@/app/actions/usuarios";
import { House } from "lucide-react";
import { InicioScreen, PublicInicioScreen, type InicioAccount } from "@/components/screens/inicio-screen";
import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { Fab, NewRevisionFab } from "@/components/shell/fab";
import { Header } from "@/components/shell/header";
import { AppNavigationProvider } from "@/components/shell/navigation-context";
import { RevisionDetailScreen } from "@/components/screens/revision-detail-screen";
import { RevisionFormScreen } from "@/components/screens/revision-form-screen";
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
import type { RevisionMode } from "@/lib/revision-form";

type AppShellProps = {
  initialUser?: UsuarioShell | null;
  initialScreen: ScreenId;
  revisionesInicio: InicioRevisionRow[];
  revisionesError: string | null;
  upsellsInicio: InicioRevisionRow[];
  revisionActivityInicio: RevisionActivity[] | null;
  activityError: string | null;
  menusInicio: MenuDelDia[];
  menusError: string | null;
  initialDay: string;
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
  const { selectedRevision, acceptRevision } = useRevisiones();
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<RevisionMode>("manual");
  const [shareEvidence, setShareEvidence] = useState<{ casita: string; files: File[] } | null>(null);
  const formVisible = formOpen && navigation.screen === "revisiones";
  useLayoutEffect(() => {
    const syncForm = () => {
      const params = new URL(window.location.href).searchParams;
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
    const url = new URL(window.location.href);
    url.searchParams.set("nueva", "1");
    if (mode === "reconocimiento") url.searchParams.set("modo", mode);
    else url.searchParams.delete("modo");
    window.history.pushState({ ...window.history.state, casitaForm: true }, "", url);
    setFormMode(mode);
    setFormOpen(true);
  };
  const closeForm = useCallback(() => {
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
  const screenElements = useRef<
    Partial<Record<ScreenId, HTMLDivElement | null>>
  >({});
  const [showTop, setShowTop] = useState<Partial<Record<ScreenId, boolean>>>(
    {},
  );
  const screens = {
    otros: <OtrosScreen active={navigation.screen === "otros"} session={session} />,
    inicio: (
      <InicioScreen account={account} menus={menusInicio} menusError={menusError} />
    ),
    revisiones: <RevisionesScreen />,
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
                const visible = event.currentTarget.scrollTop > 500;
                setShowTop((previous) =>
                  previous[id] === visible
                    ? previous
                    : { ...previous, [id]: visible },
                );
              }}
              hidden={navigation.screen !== id || formVisible}
              inert={navigation.screen !== id || formVisible ? true : undefined}
              className={`app-screen${id === "revisiones" ? " app-screen-with-create" : ""}`}
              aria-label={SCREENS[id].title}
              tabIndex={-1}
            >
              {screens[id]}
            </div>
          ))}
          <RevisionFormScreen open={formVisible} mode={formMode} reviewer={session.nombre} onClose={closeForm} onSaved={(row, files) => {
            acceptRevision(row);
            closeForm();
            if (files.length) setShareEvidence({ casita: row.casita, files });
          }} />
          {navigation.screen === "revisiones" && !formVisible && !detailOpen && <NewRevisionFab onSelect={openForm} />}
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
        <BottomNavigation />
      </div>
      {selectedRevision && (
        <RevisionDetailScreen key={selectedRevision.id} />
      )}
      {shareEvidence && <RevisionShareSheet casita={shareEvidence.casita} files={shareEvidence.files} onClose={() => {
        setShareEvidence(null);
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".new-revision-fab")?.focus({ preventScroll: true }));
      }} />}
    </div>
  );
}

export function AppShell({
  initialUser = null,
  initialScreen,
  revisionesInicio,
  revisionesError,
  upsellsInicio,
  revisionActivityInicio,
  activityError,
  menusInicio,
  menusError,
  initialDay,
}: AppShellProps) {
  const navigation = useAppNavigation(initialScreen);
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [previousInitialUser, setPreviousInitialUser] = useState(initialUser);
  const [sessionError, setSessionError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [entering, setEntering] = useState(false);
  const sessionGeneration = useRef(0);

  if (previousInitialUser !== initialUser) {
    setPreviousInitialUser(initialUser);
    setUser(initialUser);
  }
  useEffect(() => {
    // The initial session was checked on the server. Anonymous polling competes
    // with login/MFA in Next's sequential Server Action queue.
    if (!user) return;
    let live = true;
    let checking = false;
    let lastCheck = Date.now();
    const check = async () => {
      if (checking || !navigator.onLine || document.visibilityState !== "visible" || Date.now() - lastCheck < 15_000) return;
      checking = true;
      lastCheck = Date.now();
      const generation = sessionGeneration.current;
      try {
        const current = await currentUsuario();
        if (live && navigator.onLine && generation === sessionGeneration.current && !current) setUser(null);
      } catch {
        // Transport errors do not confirm a logout. Server actions continue to
        // enforce authorization; retry the check when connectivity returns.
      } finally {
        checking = false;
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    const onLogout = () => { setUser(null); router.refresh(); };
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
  }, [router, user]);

  if (!user) return (
    <div className="app-shell">
      <div className="app-shell-frame">
        <header className="app-header">
          <div className="header-inner">
            <div className="app-brand">
              <span className="brand-mark">
                <House size={23} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <p className="brand-name">Casitas</p>
            </div>
          </div>
        </header>
        <PublicInicioScreen menus={menusInicio} menusError={menusError} today={initialDay} onSuccess={(authenticatedUser) => {
          sessionGeneration.current += 1;
          setEntering(true);
          setUser(authenticatedUser);
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
        initialDay={initialDay}
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
