"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import { fetchInicioMenus } from "@/app/actions/menus";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { menuChipLabel, menuDateHeading } from "@/lib/menus";
import type { MenuDelDia } from "@/types/database";

type Snapshot = { id: "menus"; rows: MenuDelDia[]; savedAt: string };

function MenuDishes({ comidas }: { comidas: string[] }) {
  if (comidas.length === 0) {
    return <p className="menu-empty-dishes">Todavía no hay platos en este menú.</p>;
  }

  return (
    <ul className="menu-dishes">
      {comidas.map((dish) => (
        <li key={dish}>{dish}</li>
      ))}
    </ul>
  );
}

export function MenuDelDia({
  initialMenus,
  initialError,
  today,
  online,
}: {
  initialMenus: MenuDelDia[];
  initialError: string | null;
  today: string;
  online: boolean;
}) {
  const [menus, setMenus] = useState(initialMenus);
  const [error, setError] = useState(initialError);
  const [localAvailable, setLocalAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFecha, setSelectedFecha] = useState(
    initialMenus.find((menu) => menu.fecha === today)?.fecha ??
      initialMenus[0]?.fecha ??
      today,
  );
  const persisted = useRef(false);

  const persist = useCallback(async (rows: MenuDelDia[]) => {
    try {
      await idbPut<Snapshot>(IDB_STORES.snapshots, {
        id: "menus",
        rows,
        savedAt: new Date().toISOString(),
      });
      setLocalAvailable(true);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    setMenus(initialMenus);
    setError(initialError);
    if (!persisted.current && initialMenus.length > 0 && !initialError) {
      persisted.current = true;
      void persist(initialMenus);
    }
  }, [initialError, initialMenus, persist]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!initialError && navigator.onLine) return;
      try {
        const cached = await idbGet<Snapshot>(IDB_STORES.snapshots, "menus");
        if (cancelled || !cached?.rows.length) return;
        setMenus(cached.rows);
        setLocalAvailable(true);
        setError(null);
      } catch {
        return;
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [initialError]);

  useEffect(() => {
    if (!online || !error) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await fetchInicioMenus();
      if (cancelled || result.error) return;
      setMenus(result.menus);
      setError(null);
      await persist(result.menus);
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [error, online, persist]);

  const todayMenu = useMemo(
    () => menus.find((menu) => menu.fecha === today) ?? null,
    [menus, today],
  );
  const upcoming = useMemo(
    () => menus.filter((menu) => menu.fecha > today),
    [menus, today],
  );
  const selectedMenu = useMemo(
    () =>
      menus.find((menu) => menu.fecha === selectedFecha) ??
      todayMenu ??
      menus[0] ??
      null,
    [menus, selectedFecha, todayMenu],
  );

  const openMenus = () => {
    setSelectedFecha(todayMenu?.fecha ?? menus[0]?.fecha ?? today);
    setOpen(true);
  };

  if (menus.length === 0 && !error) {
    return (
      <div className="menu-day-card is-empty">
        <div className="menu-day-icon" aria-hidden="true">
          <UtensilsCrossed size={22} strokeWidth={1.7} />
        </div>
        <div>
          <p className="menu-day-kicker">Menú del día</p>
          <h2>Hoy no hay menú</h2>
          <p>Cuando se publique, lo verás aquí.</p>
        </div>
      </div>
    );
  }

  if (menus.length === 0 && error) {
    return (
      <div className="menu-day-card is-empty">
        <div className="menu-day-icon" aria-hidden="true">
          <UtensilsCrossed size={22} strokeWidth={1.7} />
        </div>
        <div>
          <p className="menu-day-kicker">Menú del día</p>
          <h2>No pudimos cargar el menú</h2>
          <p>
            {localAvailable
              ? "Conservamos la última copia en este dispositivo."
              : "Vuelve a intentarlo cuando tengas conexión."}
          </p>
        </div>
      </div>
    );
  }

  const featured = todayMenu ?? upcoming[0] ?? null;
  if (!featured) return null;

  return (
    <>
      <button
        type="button"
        className="menu-day-card"
        onClick={openMenus}
        aria-label={
          todayMenu
            ? `Menú de hoy, ${todayMenu.comidas.join(", ") || "sin platos"}. Ver menús de los siguientes días`
            : `Hoy no hay menú. Ver menús de los siguientes días`
        }
      >
        <div className="menu-day-top">
          <div className="menu-day-icon" aria-hidden="true">
            <UtensilsCrossed size={22} strokeWidth={1.7} />
          </div>
          <div className="menu-day-copy">
            <p className="menu-day-kicker">Menú del día</p>
            <h2>
              {todayMenu
                ? menuDateHeading(todayMenu.fecha)
                : "Hoy no hay menú"}
            </h2>
          </div>
          <ChevronRight size={19} className="card-chevron" aria-hidden="true" />
        </div>
        {todayMenu ? (
          <MenuDishes comidas={todayMenu.comidas} />
        ) : (
          <p className="menu-empty-dishes">
            El próximo menú es {menuDateHeading(featured.fecha)}.
          </p>
        )}
        <span className="menu-day-hint">
          {upcoming.length > 0
            ? `Ver los próximos ${upcoming.length} ${upcoming.length === 1 ? "día" : "días"}`
            : "Ver menú"}
        </span>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Menús"
      >
        <p className="sheet-description">
          Elige un día para ver qué hay de comer.
        </p>
        <div className="menu-day-chips" aria-label="Días con menú">
          {menus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              aria-pressed={selectedMenu?.fecha === menu.fecha}
              className={selectedMenu?.fecha === menu.fecha ? "is-selected" : ""}
              onClick={() => setSelectedFecha(menu.fecha)}
            >
              {menuChipLabel(menu.fecha, today)}
            </button>
          ))}
        </div>
        {selectedMenu && (
          <div className="menu-sheet-body">
            <h3>{menuDateHeading(selectedMenu.fecha)}</h3>
            <MenuDishes comidas={selectedMenu.comidas} />
          </div>
        )}
      </BottomSheet>
    </>
  );
}
