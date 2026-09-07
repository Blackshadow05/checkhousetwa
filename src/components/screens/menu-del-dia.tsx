"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, UtensilsCrossed } from "lucide-react";
import { fetchInicioMenus } from "@/app/actions/menus";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { menuChipLabel, menuDateHeading } from "@/lib/menus";
import type { MenuDelDia } from "@/types/database";
import styles from "./inicio-screen.module.css";

type Snapshot = { id: "menus"; rows: MenuDelDia[]; savedAt: string };

function MenuDishes({ comidas }: { comidas: string[] }) {
  if (comidas.length === 0) {
    return <h3 className={styles.menuDate}>Sin platos</h3>;
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
  const [previousInitial, setPreviousInitial] = useState({ menus: initialMenus, error: initialError });
  const [open, setOpen] = useState(false);
  const [selectedFecha, setSelectedFecha] = useState(
    initialMenus.find((menu) => menu.fecha === today)?.fecha ??
      initialMenus[0]?.fecha ??
      today,
  );
  const persisted = useRef(false);

  if (previousInitial.menus !== initialMenus || previousInitial.error !== initialError) {
    setPreviousInitial({ menus: initialMenus, error: initialError });
    setMenus(initialMenus);
    setError(initialError);
  }

  const persist = useCallback(async (rows: MenuDelDia[]) => {
    try {
      await idbPut<Snapshot>(IDB_STORES.snapshots, {
        id: "menus",
        rows,
        savedAt: new Date().toISOString(),
      });
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
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

  if (menus.length === 0) {
    return (
      <section className={styles.board} aria-label="Menú del día">
        <div className={styles.sectionHeading}>
          <UtensilsCrossed size={20} aria-hidden="true" />
          <h2>Menú del día</h2>
        </div>
        <div className={styles.card}>
          <div className={styles.empty}><h3>{error ? "Menú no disponible" : "Sin menú para hoy"}</h3></div>
        </div>
      </section>
    );
  }

  const featured = todayMenu ?? upcoming[0] ?? null;
  if (!featured) return null;

  return (
    <>
      <button
        type="button"
        className={`${styles.card} ${styles.menuButton}`}
        onClick={openMenus}
        aria-label={
          todayMenu
            ? `Menú de hoy, ${todayMenu.comidas.join(", ") || "sin platos"}. Ver menús de los siguientes días`
            : `Menú del ${menuDateHeading(featured.fecha)}. Ver menús`
        }
      >
        <div className={styles.sectionHeading}>
          <UtensilsCrossed size={20} aria-hidden="true" />
          <h2>{todayMenu ? "Menú del día" : "Próximo menú"}</h2>
          <ChevronRight size={19} aria-hidden="true" />
        </div>
        {!todayMenu && <h3 className={styles.menuDate}>{menuDateHeading(featured.fecha)}</h3>}
        <MenuDishes comidas={featured.comidas} />
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Menús"
      >
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
