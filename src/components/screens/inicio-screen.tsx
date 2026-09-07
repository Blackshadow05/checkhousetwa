"use client";

import { ChevronRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { HoyCasitas } from "@/components/screens/hoy-casitas";
import { MenuDelDia } from "@/components/screens/menu-del-dia";
import { useRevisiones } from "@/components/screens/revisiones-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { casitasSinRevision } from "@/lib/casitas-sin-revision";
import type { MenuDelDia as MenuDelDiaRow } from "@/types/database";
import styles from "./inicio-screen.module.css";

export function InicioScreen({
  menus = [],
  menusError = null,
}: {
  menus?: MenuDelDiaRow[];
  menusError?: string | null;
}) {
  const { today, online, revisionActivity, activityError, refreshing, refresh } = useRevisiones();
  const [showAll, setShowAll] = useState(false);
  const pendientes = casitasSinRevision(revisionActivity, today);

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
          <h2 id="pending-casitas-title">Más de 7 días sin revisión</h2>
          {pendientes !== null && <span className={styles.pendingCount}>{pendientes.length}</span>}
        </div>
        <div className={styles.card}>
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
                <ul className={styles.pendingGrid} aria-label="Casitas sin revisión reciente">
                  {pendientes.slice(0, 10).map((number) => <li key={number} aria-label={`Casita ${number}`}>{number}</li>)}
                </ul>
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
      <BottomSheet open={showAll} onClose={() => setShowAll(false)} title="Más de 7 días sin revisión">
        {showAll && pendientes !== null && (
          <ul className={`${styles.pendingGrid} ${styles.sheetGrid}`} aria-label="Todas las casitas sin revisión reciente">
            {pendientes.map((number) => <li key={number} aria-label={`Casita ${number}`}>{number}</li>)}
          </ul>
        )}
      </BottomSheet>
    </section>
  );
}
