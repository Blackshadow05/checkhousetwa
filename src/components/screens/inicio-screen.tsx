"use client";

import {
  Check,
  ChevronRight,
  CloudOff,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fetchLatestRevisionCasita } from "@/app/actions/revisiones";
import { LoginForm, type RetornoGoogle } from "@/components/auth/login-form";
import { ConsejoDelDia } from "@/components/screens/consejo-del-dia";
import { HoyCasitas } from "@/components/screens/hoy-casitas";
import { MenuDelDia } from "@/components/screens/menu-del-dia";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { casitasSinRevision } from "@/lib/casitas-sin-revision";
import { menuDateHeading } from "@/lib/menus";
import { casitaNumber, groupHoyCasitas, initials } from "@/lib/revisiones-display";
import { useOnline } from "@/lib/use-online";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import type { MenuDelDia as MenuDelDiaRow } from "@/types/database";
import styles from "./inicio-screen.module.css";

export type InicioAccount = {
  nombre: string;
  rol?: string | null;
  loggingOut: boolean;
  error: string;
  onLogout: () => void;
};

const DAY_OPTIONS = [3, 7];

const ROLE_LABELS: Record<string, string> = {
  user: "Usuario",
  admin: "Administrador",
  SuperAdmin: "Superadministrador",
};

function subscribeClock(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

function greetingNow() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Costa_Rica",
    }).format(new Date()),
  );
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function PublicInicioScreen({
  menus, menusError, today, retornoGoogle: retornoInicial, onSuccess,
}: {
  menus: MenuDelDiaRow[];
  menusError: string | null;
  today: string;
  retornoGoogle?: RetornoGoogle;
  onSuccess: (user: { id: number; nombre: string }) => void;
}) {
  const online = useOnline();
  const [loginOpen, setLoginOpen] = useState(Boolean(retornoInicial));
  const [retornoGoogle, setRetornoGoogle] = useState(retornoInicial);
  const signedIn = useRef<{ id: number; nombre: string } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("auth")) return;
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <>
      <main className="app-main">
        <div className="app-screen">
          <section className={styles.screen} aria-label="Inicio">
            <ConsejoDelDia initialDay={today} online={online} />
            <MenuDelDia initialMenus={menus} initialError={menusError} today={today} online={online} />
          </section>
        </div>
      </main>
      <div className={styles.actionBar}>
        {!online && (
          <p className={styles.actionNote} role="status">
            <WifiOff size={15} aria-hidden="true" /> Necesitas conexión para iniciar sesión.
          </p>
        )}
        <button type="button" className={styles.loginButton} onClick={() => setLoginOpen(true)} aria-haspopup="dialog">
          <LogIn size={20} aria-hidden="true" /> Iniciar sesión
        </button>
      </div>
      <BottomSheet
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onExited={() => {
          setRetornoGoogle(undefined);
          if (signedIn.current) onSuccess(signedIn.current);
        }}
        title="Iniciar sesión"
      >
        {loginOpen && (
          <LoginForm
            online={online}
            variant="sheet"
            retornoGoogle={retornoGoogle}
            onSuccess={(user) => {
              signedIn.current = user;
              setLoginOpen(false);
            }}
          />
        )}
      </BottomSheet>
    </>
  );
}

export function InicioScreen({
  account,
  menus = [],
  menusError = null,
}: {
  account: InicioAccount;
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [opening, setOpening] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openingRef = useRef<number | null>(null);
  const fromSheet = useRef(false);
  const screenRef = useRef<HTMLElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const greeting = useSyncExternalStore(subscribeClock, greetingNow, greetingNow);
  const groups = useMemo(
    () => groupHoyCasitas(revisiones, today, upsells),
    [revisiones, today, upsells],
  );
  const totalHoy = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const pendientes = casitasSinRevision(revisionActivity, today, days);
  const firstName = account.nombre.trim().split(/\s+/)[0] || account.nombre;
  const rol = account.rol?.trim();

  usePullToRefresh(
    screenRef,
    pullRef,
    useCallback(() => refresh({ force: true }), [refresh]),
    refreshing,
  );

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
      .filter((row) => !row.pendiente && casitaNumber(row.casita) === number)
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
          {opening === Number(number) ? (
            <LoaderCircle size={18} className="auth-spinner" aria-hidden="true" />
          ) : (
            number
          )}
        </button>
      </li>
    ));

  return (
    <section ref={screenRef} className={styles.screen} aria-label="Inicio">
      <div ref={pullRef} className={styles.pull} data-state="idle" aria-hidden="true">
        <span>
          <RefreshCw size={18} strokeWidth={2.2} />
        </span>
      </div>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <time dateTime={today}>{menuDateHeading(today)}</time>
            <h1>
              {greeting}, {firstName}
            </h1>
          </div>
          <button
            type="button"
            className={styles.avatar}
            onClick={() => setAccountOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Cuenta de ${account.nombre}`}
          >
            {initials(account.nombre)}
          </button>
        </div>
      </header>
      <ConsejoDelDia initialDay={today} online={online} headingLevel={2} />
      <MenuDelDia
        initialMenus={menus}
        initialError={menusError}
        today={today}
        online={online}
      />
      <HoyCasitas groups={groups} total={totalHoy} />
      <section id="pending-casitas" className={styles.board} aria-labelledby="pending-casitas-title">
        <div className={styles.sectionHeading}>
          <h2 id="pending-casitas-title">Sin revisión</h2>
          <div className={styles.segmented} role="group" aria-label="Días sin revisión">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={days === option}
                onClick={() => setDays(option)}
              >
                {option} días
              </button>
            ))}
          </div>
        </div>
        <div className={styles.card}>
          {pendientes === null ? (
            refreshing ? (
              <div className={styles.skeletonGrid} role="status" aria-label="Actualizando">
                {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
              </div>
            ) : (
              <div className={styles.empty} role="status">
                <span className={styles.emptyIcon}>
                  <CloudOff size={20} aria-hidden="true" />
                </span>
                <p>{online ? "No disponible por ahora" : "Sin datos guardados"}</p>
                {online && (
                  <button className={styles.textButton} type="button" onClick={() => void refresh()}>
                    Reintentar
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              {(!online || activityError) && (
                <p className={styles.savedStatus} role="status">Mostrando datos guardados</p>
              )}
              {pendientes.length === 0 ? (
                <div className={styles.empty}>
                  <span className={`${styles.emptyIcon} ${styles.emptyOk}`}>
                    <Check size={20} aria-hidden="true" />
                  </span>
                  <p>Todas las casitas están al día</p>
                </div>
              ) : (
                <>
                  <p className={styles.hint}>Toca una casita para abrir su última revisión.</p>
                  <ul className={styles.pendingGrid} aria-label="Casitas sin revisión reciente">
                    {pendingItems(pendientes.slice(0, 10))}
                  </ul>
                  {notice && <p className={styles.notice} role="status">{notice}</p>}
                </>
              )}
              {pendientes.length > 10 && (
                <button className={styles.showAll} type="button" aria-haspopup="dialog" onClick={() => setShowAll(true)}>
                  Ver todas
                  <span>
                    {pendientes.length}
                    <ChevronRight size={18} aria-hidden="true" />
                  </span>
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
      <BottomSheet open={accountOpen} onClose={() => setAccountOpen(false)} title="Cuenta">
        <div className={styles.accountProfile}>
          <span className={styles.avatarLarge} aria-hidden="true">
            {initials(account.nombre)}
          </span>
          <div>
            <strong>{account.nombre}</strong>
            <span>{(rol && ROLE_LABELS[rol]) || "Sesión iniciada"}</span>
          </div>
        </div>
        {account.error && (
          <p className={`auth-error ${styles.accountError}`} role="alert">
            {account.error}
          </p>
        )}
        <button
          type="button"
          className={styles.logoutButton}
          disabled={account.loggingOut}
          onClick={account.onLogout}
        >
          {account.loggingOut ? (
            <LoaderCircle size={19} className="auth-spinner" aria-hidden="true" />
          ) : (
            <LogOut size={19} aria-hidden="true" />
          )}
          {account.loggingOut ? "Cerrando sesión" : "Cerrar sesión"}
        </button>
      </BottomSheet>
    </section>
  );
}
