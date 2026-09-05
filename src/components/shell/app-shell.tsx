"use client";

import { useRef, useState } from "react";
import { BottomNavigation } from "@/components/shell/bottom-navigation";
import { Fab } from "@/components/shell/fab";
import { Header } from "@/components/shell/header";
import { AppNavigationProvider } from "@/components/shell/navigation-context";
import { InicioScreen } from "@/components/screens/inicio-screen";
import { RevisionDetailScreen } from "@/components/screens/revision-detail-screen";
import { RevisionesScreen } from "@/components/screens/revisiones-screen";
import { SyncScreen } from "@/components/screens/sync-screen";
import {
  RevisionesProvider,
  useRevisiones,
} from "@/components/screens/revisiones-provider";
import { useAppNavigation } from "@/lib/navigation/use-app-navigation";
import { SCREEN_ORDER, SCREENS, type ScreenId } from "@/lib/navigation/screens";
import type { InicioRevisionRow } from "@/types/database";

type AppShellProps = {
  initialScreen: ScreenId;
  revisionesInicio: InicioRevisionRow[];
  revisionesError: string | null;
  initialDay: string;
};

function AppShellFrame({
  navigation,
}: {
  navigation: ReturnType<typeof useAppNavigation>;
}) {
  const { selectedRevision } = useRevisiones();
  const screenElements = useRef<
    Partial<Record<ScreenId, HTMLDivElement | null>>
  >({});
  const [showTop, setShowTop] = useState<Partial<Record<ScreenId, boolean>>>(
    {},
  );
  const screens = {
    inicio: <InicioScreen />,
    revisiones: <RevisionesScreen />,
    sync: <SyncScreen />,
  };
  const detailOpen = selectedRevision !== null;

  return (
    <div className="app-shell">
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
              hidden={navigation.screen !== id}
              inert={navigation.screen !== id ? true : undefined}
              className="app-screen"
              aria-label={SCREENS[id].title}
              tabIndex={-1}
            >
              {screens[id]}
            </div>
          ))}
        </main>
        {showTop[navigation.screen] && !detailOpen && (
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
  initialDay,
}: AppShellProps) {
  const navigation = useAppNavigation(initialScreen);

  return (
    <AppNavigationProvider value={navigation}>
      <RevisionesProvider
        initialRows={revisionesInicio}
        initialError={revisionesError}
        initialDay={initialDay}
      >
        <AppShellFrame navigation={navigation} />
      </RevisionesProvider>
    </AppNavigationProvider>
  );
}
