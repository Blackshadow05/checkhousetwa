"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { Fab, NewRevisionFab } from "@/components/shell/fab";
import { Header } from "@/components/shell/header";
import { AppNavigationProvider } from "@/components/shell/navigation-context";
import { InicioScreen } from "@/components/screens/inicio-screen";
import { RevisionDetailScreen } from "@/components/screens/revision-detail-screen";
import { RevisionFormScreen } from "@/components/screens/revision-form-screen";
import { RevisionesScreen } from "@/components/screens/revisiones-screen";
import { SyncScreen } from "@/components/screens/sync-screen";
import {
  RevisionesProvider,
  useRevisiones,
} from "@/components/screens/revisiones-provider";
import { useAppNavigation } from "@/lib/navigation/use-app-navigation";
import { SCREEN_ORDER, SCREENS, type ScreenId } from "@/lib/navigation/screens";
import type { InicioRevisionRow, MenuDelDia } from "@/types/database";

type AppShellProps = {
  initialScreen: ScreenId;
  revisionesInicio: InicioRevisionRow[];
  revisionesError: string | null;
  upsellsInicio: InicioRevisionRow[];
  menusInicio: MenuDelDia[];
  menusError: string | null;
  initialDay: string;
};

function AppShellFrame({
  navigation,
  menusInicio,
  menusError,
}: {
  navigation: ReturnType<typeof useAppNavigation>;
  menusInicio: MenuDelDia[];
  menusError: string | null;
}) {
  const { selectedRevision, acceptRevision } = useRevisiones();
  const [formOpen, setFormOpen] = useState(false);
  const [savedRevision, setSavedRevision] = useState<InicioRevisionRow | null>(null);
  const formVisible = formOpen && navigation.screen === "revisiones";
  useEffect(() => {
    const syncForm = () => setFormOpen(new URL(window.location.href).searchParams.get("nueva") === "1");
    syncForm();
    window.addEventListener("popstate", syncForm);
    window.addEventListener("casitas:navigate", syncForm);
    return () => {
      window.removeEventListener("popstate", syncForm);
      window.removeEventListener("casitas:navigate", syncForm);
    };
  }, [navigation.screen]);
  const openForm = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("nueva", "1");
    window.history.pushState({ ...window.history.state, casitaForm: true }, "", url);
    setFormOpen(true);
  };
  const closeForm = useCallback(() => {
    setFormOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("nueva")) {
      if (window.history.state?.casitaForm) window.history.back();
      else {
        url.searchParams.delete("nueva");
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
    inicio: (
      <InicioScreen menus={menusInicio} menusError={menusError} />
    ),
    revisiones: <RevisionesScreen savedRevision={savedRevision} onDismissSaved={() => setSavedRevision(null)} />,
    sync: <SyncScreen />,
  };
  const detailOpen = selectedRevision !== null;

  return (
    <div className={`app-shell${formVisible ? " is-creating-revision" : ""}`}>
      <div
        className="app-shell-frame"
        inert={detailOpen ? true : undefined}
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
          <RevisionFormScreen open={formVisible} onClose={closeForm} onSaved={(row) => {
            acceptRevision(row);
            setSavedRevision(row);
            closeForm();
          }} />
          {navigation.screen === "revisiones" && !formVisible && !detailOpen && <NewRevisionFab onClick={openForm} />}
        </main>
        {showTop[navigation.screen] && navigation.screen !== "revisiones" && !detailOpen && (
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
        <BottomNavigation />
      </div>
      {selectedRevision && (
        <RevisionDetailScreen key={selectedRevision.id} />
      )}
    </div>
  );
}

export function AppShell({
  initialScreen,
  revisionesInicio,
  revisionesError,
  upsellsInicio,
  menusInicio,
  menusError,
  initialDay,
}: AppShellProps) {
  const navigation = useAppNavigation(initialScreen);

  return (
    <AppNavigationProvider value={navigation}>
      <RevisionesProvider
        initialRows={revisionesInicio}
        initialUpsells={upsellsInicio}
        initialError={revisionesError}
        initialDay={initialDay}
      >
        <AppShellFrame
          navigation={navigation}
          menusInicio={menusInicio}
          menusError={menusError}
        />
      </RevisionesProvider>
    </AppNavigationProvider>
  );
}
