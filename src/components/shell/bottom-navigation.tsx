"use client";

import { ClipboardList, House, CloudDownload } from "lucide-react";
import { SCREEN_ORDER, SCREENS, type ScreenId } from "@/lib/navigation/screens";
import { useAppNavigationContext } from "@/components/shell/navigation-context";

const ICONS: Record<ScreenId, typeof House> = {
  inicio: House,
  revisiones: ClipboardList,
  sync: CloudDownload,
};

export function BottomNavigation() {
  const { screen, navigate } = useAppNavigationContext();
  return (
    <nav className="bottom-navigation" aria-label="Navegación principal">
      <div className="bottom-navigation-inner">
        {SCREEN_ORDER.map((id) => {
          const Icon = ICONS[id];
          const active = screen === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={`nav-item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.1 : 1.7}
                  aria-hidden="true"
                />
              </span>
              <span>{SCREENS[id].title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
