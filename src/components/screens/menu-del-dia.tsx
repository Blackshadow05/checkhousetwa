"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  const titleId = useId();

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
      <section className={styles.board} aria-labelledby={titleId}>
        <div className={styles.sectionHeading}>
          <h2 id={titleId}>Menú del día</h2>
        </div>
        <div className={styles.card}>
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <UtensilsCrossed size={20} aria-hidden="true" />
            </span>
            <p>{error ? "Menú no disponible" : "Sin menú para hoy"}</p>
          </div>
        </div>
      </section>
    );
  }

  const featured = todayMenu ?? upcoming[0] ?? null;
  if (!featured) return null;
  const dishCount = featured.comidas.length;

  return (
    <section className={styles.board} aria-labelledby={titleId}>
      <div className={styles.sectionHeading}>
        <h2 id={titleId}>{todayMenu ? "Menú del día" : "Próximo menú"}</h2>
      </div>
      <button
        type="button"
        className={`${styles.card} ${styles.menuCard}`}
        onClick={openMenus}
        aria-haspopup="dialog"
        aria-label={
          todayMenu
            ? `Menú de hoy, ${todayMenu.comidas.join(", ") || "sin platos"}. Ver menús de los siguientes días`
            : `Menú del ${menuDateHeading(featured.fecha)}. Ver menús`
        }
      >
        <span className={styles.menuTop}>
          <span className={styles.iconTile}>
            <UtensilsCrossed size={20} aria-hidden="true" />
          </span>
          <span className={styles.menuTitle}>
            <strong>{todayMenu ? "Hoy" : menuDateHeading(featured.fecha)}</strong>
            <span>
              {dishCount === 0 ? "Sin platos" : dishCount === 1 ? "1 plato" : `${dishCount} platos`}
              {menus.length > 1 ? " · Ver otros días" : ""}
            </span>
          </span>
          <ChevronRight size={20} className={styles.chevron} aria-hidden="true" />
        </span>
        {dishCount > 0 && (
          <span className={styles.dishes}>
            {featured.comidas.map((dish) => (
              <span key={dish}>{dish}</span>
            ))}
          </span>
        )}
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
    </section>
  );
}
