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
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFecha, setSelectedFecha] = useState(
    initialMenus.find((menu) => menu.fecha === today)?.fecha ??
      initialMenus[0]?.fecha ??
      today,
  );
  const persisted = useRef(false);
  const fromCache = useRef(false);
  const previousToday = useRef(today);
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

  const refreshMenus = useCallback(async () => {
    if (!navigator.onLine) return;
    setRefreshing(true);
    try {
      const result = await fetchInicioMenus();
      if (result.error) return;
      fromCache.current = false;
      previousToday.current = today;
      setMenus(result.menus);
      setError(null);
      await persist(result.menus);
    } catch {
      return;
    } finally {
      setRefreshing(false);
    }
  }, [persist, today]);

  useEffect(() => {
    if (!persisted.current && initialMenus.length > 0 && !initialError) {
      persisted.current = true;
      fromCache.current = false;
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
        fromCache.current = true;
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
    const reload = async () => {
      try {
        const result = await fetchInicioMenus();
        if (result.error) return;
        fromCache.current = false;
        previousToday.current = today;
        setMenus(result.menus);
        setError(null);
        await persist(result.menus);
      } catch {
        return;
      }
    };
    window.addEventListener("casitas:menus-actualizados", reload);
    return () => window.removeEventListener("casitas:menus-actualizados", reload);
  }, [persist, today]);

  useEffect(() => {
    const todayChanged = previousToday.current !== today;
    if (!online || (!error && !fromCache.current && !todayChanged)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await fetchInicioMenus();
        if (cancelled || result.error) return;
        fromCache.current = false;
        previousToday.current = today;
        setMenus(result.menus);
        setError(null);
        await persist(result.menus);
      } catch {
        return;
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [error, online, persist, today]);

  const todayMenu = useMemo(
    () => menus.find((menu) => menu.fecha === today) ?? null,
    [menus, today],
  );
  const upcoming = useMemo(
    () => menus.filter((menu) => menu.fecha > today),
    [menus, today],
  );
  const latestMenu = useMemo(
    () =>
      menus.length > 0
        ? menus.reduce((latest, menu) => (menu.fecha > latest.fecha ? menu : latest), menus[0])
        : null,
    [menus],
  );
  const selectedMenu = useMemo(
    () =>
      menus.find((menu) => menu.fecha === selectedFecha) ??
      todayMenu ??
      upcoming[0] ??
      latestMenu ??
      null,
    [latestMenu, menus, selectedFecha, todayMenu, upcoming],
  );

  const openMenus = () => {
    setSelectedFecha(todayMenu?.fecha ?? upcoming[0]?.fecha ?? latestMenu?.fecha ?? today);
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
  const dishCount = featured?.comidas.length ?? 0;

  return (
    <section className={styles.board} aria-labelledby={titleId}>
      <div className={styles.sectionHeading}>
        <h2 id={titleId}>{featured && !todayMenu ? "Próximo menú" : "Menú del día"}</h2>
      </div>
      {featured ? (
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
      ) : (
        <div className={styles.card}>
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <UtensilsCrossed size={20} aria-hidden="true" />
            </span>
            <p>No hay menú publicado para hoy</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={openMenus}
              aria-haspopup="dialog"
            >
              Ver último
            </button>
            {online && (
              <button
                type="button"
                className={styles.textButton}
                disabled={refreshing}
                onClick={() => void refreshMenus()}
              >
                {refreshing ? "Actualizando…" : "Actualizar"}
              </button>
            )}
          </div>
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Menús"
        swipeToClose
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
