"use client";

import { ChevronRight, Clock3, LogIn } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { useOnline } from "@/lib/use-online";
import { useEffect, useRef, useState } from "react";
import { fetchLatestRevisionCasita } from "@/app/actions/revisiones";
import { HoyCasitas } from "@/components/screens/hoy-casitas";
import { MenuDelDia } from "@/components/screens/menu-del-dia";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { casitasSinRevision } from "@/lib/casitas-sin-revision";
import { casitaNumber } from "@/lib/revisiones-display";
import type { MenuDelDia as MenuDelDiaRow } from "@/types/database";
import styles from "./inicio-screen.module.css";

export function PublicInicioScreen({
  menus, menusError, today, onSuccess,
}: {
  menus: MenuDelDiaRow[];
  menusError: string | null;
  today: string;
  onSuccess: (user: { id: number; nombre: string }) => void;
}) {
  const online = useOnline();
  const [loginOpen, setLoginOpen] = useState(false);
  return (
    <section className={styles.screen} aria-label="Inicio">
      <header className={styles.heading}><h1>Inicio</h1></header>
      <div className={styles.card}>
        <p>Consulta el menú sin iniciar sesión. Para ver revisiones y otras herramientas, ingresa a tu cuenta.</p>
        <button type="button" className={styles.loginButton} onClick={() => setLoginOpen(true)} aria-haspopup="dialog">
          <LogIn size={20} aria-hidden="true" /> Iniciar sesión
        </button>
        {!online && <p role="status">Necesitas conexión para iniciar sesión.</p>}
      </div>
      <MenuDelDia initialMenus={menus} initialError={menusError} today={today} online={online} />
      <BottomSheet open={loginOpen} onClose={() => setLoginOpen(false)} title="Iniciar sesión">
        {loginOpen && <LoginForm online={online} variant="sheet" onSuccess={onSuccess} />}
      </BottomSheet>
    </section>
  );
}

export function InicioScreen({
  menus = [],
  menusError = null,
}: {
  menus?: MenuDelDiaRow[];
  menusError?: string | null;
}) {
  const {
    today,
    online,
    revisiones,
    upsells,
    revisionActivity,
    activityError,
    refreshing,
    refresh,
    openRevision,
    selectedRevision,
  } = useRevisiones();
  const [showAll, setShowAll] = useState(false);
  const [days, setDays] = useState(7);
  const [opening, setOpening] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openingRef = useRef<number | null>(null);
  const fromSheet = useRef(false);
  const pendientes = casitasSinRevision(revisionActivity, today, days);

  useEffect(() => {
    if (selectedRevision || !fromSheet.current) return;
    fromSheet.current = false;
    setShowAll(true);
  }, [selectedRevision]);

  const openLatestRevision = async (casita: number) => {
    if (openingRef.current !== null) return;
    openingRef.current = casita;
    setOpening(casita);
    setNotice(null);
    const wasSheet = showAll;
    if (showAll) setShowAll(false);
    const number = String(casita);
    const local = [...revisiones, ...upsells]
      .filter((row) => casitaNumber(row.casita) === number)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (local) {
      fromSheet.current = wasSheet;
      openRevision(local);
      openingRef.current = null;
      setOpening(null);
      return;
    }
    if (!navigator.onLine) {
      setNotice(
        `Casita ${casita}: sin conexión, no tenemos su revisión en este dispositivo.`,
      );
      openingRef.current = null;
      setOpening(null);
      return;
    }
    try {
      const result = await fetchLatestRevisionCasita(number);
      if (result.error) {
        setNotice(`Casita ${casita}: ${result.error}`);
        return;
      }
      if (!result.row) {
        setNotice(`Casita ${casita} no tiene revisiones registradas.`);
        return;
      }
      fromSheet.current = wasSheet;
      openRevision(result.row);
    } catch {
      setNotice(`Casita ${casita}: no pudimos abrir la última revisión.`);
    } finally {
      openingRef.current = null;
      setOpening(null);
    }
  };

  const pendingItems = (numbers: string[]) =>
    numbers.map((number) => (
      <li key={number}>
        <button
          className={styles.pendingItem}
          type="button"
          disabled={opening !== null}
          aria-busy={opening === Number(number)}
          aria-label={`Ver última revisión de Casita ${number}`}
          onClick={() => void openLatestRevision(Number(number))}
        >
          {number}
        </button>
      </li>
    ));

  return (
    <section className={styles.screen} aria-label="Inicio">
      <header className={styles.heading}>
        <h1>Inicio</h1>
        <time dateTime={today}>
          {new Intl.DateTimeFormat("es-CR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(`${today}T12:00:00`))}
        </time>
      </header>
      <MenuDelDia
        initialMenus={menus}
        initialError={menusError}
        today={today}
        online={online}
      />
      <HoyCasitas />
      <section className={styles.board} aria-labelledby="pending-casitas-title">
        <div className={styles.sectionHeading}>
          <Clock3 size={20} className={styles.pendingIcon} aria-hidden="true" />
          <h2 id="pending-casitas-title">Más de {days} días sin revisión</h2>
          {pendientes !== null && <span className={styles.pendingCount}>{pendientes.length}</span>}
        </div>
        <div className={styles.card}>
          <label className={styles.daysSelect}>
            <select
              aria-label="Días sin revisión"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
            </select>
          </label>
          {pendientes === null ? (
            <div className={styles.empty} role="status">
              <h3>{refreshing ? "Actualizando" : online ? "No disponible" : "Sin datos guardados"}</h3>
              {online && <button className={styles.textButton} type="button" disabled={refreshing} onClick={() => void refresh()}>Reintentar</button>}
            </div>
          ) : (
            <>
              {(!online || activityError) && <span className={styles.savedStatus} role="status">Sin actualizar</span>}
              {pendientes.length === 0 ? (
                <div className={styles.empty}><h3>Todas al día</h3></div>
              ) : (
                <>
                  <ul className={styles.pendingGrid} aria-label="Casitas sin revisión reciente">
                    {pendingItems(pendientes.slice(0, 10))}
                  </ul>
                  {notice && <span className={styles.savedStatus} role="status">{notice}</span>}
                </>
              )}
              {pendientes.length > 10 && (
                <button className={styles.showAll} type="button" aria-haspopup="dialog" onClick={() => setShowAll(true)}>
                  Ver todas ({pendientes.length})
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </section>
      <BottomSheet open={showAll} onClose={() => setShowAll(false)} title={`Más de ${days} días sin revisión`}>
        {showAll && pendientes !== null && (
          <ul className={`${styles.pendingGrid} ${styles.sheetGrid}`} aria-label="Todas las casitas sin revisión reciente">
            {pendingItems(pendientes)}
          </ul>
        )}
      </BottomSheet>
    </section>
  );
}
