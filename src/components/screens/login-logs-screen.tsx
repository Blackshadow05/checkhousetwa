"use client";

import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Clock3, Globe2, KeyRound, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { GoogleIcon } from "@/components/ui/google-icon";
import { useLoginLogs } from "@/hooks/use-login-logs";
import { loginLogDay, loginLogDayLabel, loginLogMethod, loginLogTime, type LoginLog } from "@/lib/login-logs";
import styles from "./login-logs-screen.module.css";

export function LoginLogsFeature({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="pantalla-feature" onClick={onOpen}>
    <span className="pantalla-feature-icon"><LogIn size={27} aria-hidden /></span>
    <span><strong>Historial de accesos</strong><small>Usuario, hora, IP y método</small></span>
    <ArrowRight size={21} aria-hidden />
  </button>;
}

export function LoginLogsScreen({ visible, ownerId, onBack }: { visible: boolean; ownerId: number; onBack: () => void }) {
  const { snapshot, loading, loadingMore, error, notice, cached, online, refresh, loadMore } = useLoginLogs(visible, ownerId);
  const groups = useMemo(() => {
    const days = new Map<string, { label: string; rows: LoginLog[] }>();
    for (const row of snapshot?.rows || []) {
      const key = loginLogDay(row.logged_at);
      const group = days.get(key) || { label: loginLogDayLabel(row.logged_at), rows: [] };
      group.rows.push(row); days.set(key, group);
    }
    return [...days];
  }, [snapshot]);
  const status = loading ? "Actualizando…" : !online ? snapshot ? "Sin conexión · Historial guardado" : "Sin conexión" : snapshot ? cached || error ? "Historial guardado" : "Actualizado" : error ? "Sin datos disponibles" : "Cargando accesos…";

  return <section className={styles.screen} aria-label="Historial de accesos">
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={18} aria-hidden />Otros</button>
    <div className={styles.header}>
      <div><h1>Historial de accesos</h1><p className={styles.zone}><Clock3 size={14} aria-hidden />Hora de Costa Rica</p></div>
      <button type="button" className={styles.refresh} aria-label="Actualizar accesos" disabled={loading || loadingMore || !online} onClick={() => void refresh()}>
        <RefreshCw size={20} className={loading ? styles.spinning : undefined} aria-hidden />
      </button>
    </div>
    <p className={styles.status} role="status">{status}{snapshot && ` · ${snapshot.rows.length} ${snapshot.rows.length === 1 ? "acceso" : "accesos"}`}</p>
    {error && <div className={styles.notice} role="alert"><p>{error}</p>{online && <button type="button" disabled={loading || loadingMore} onClick={() => void refresh()}>Reintentar</button>}</div>}
    {notice && <p className={styles.status} role="status">{notice}</p>}
    {!snapshot && !error && online && <div className={styles.skeletons} aria-label="Cargando accesos" aria-busy="true">{[0, 1, 2].map(i => <div key={i} />)}</div>}
    {!loading && !snapshot && !error && !online && <div className={styles.empty}><LogIn size={28} aria-hidden /><h2>Sin historial guardado</h2><p>Conéctate para cargar los accesos.</p></div>}
    {snapshot && !snapshot.rows.length && <div className={styles.empty}><LogIn size={28} aria-hidden /><h2>Aún no hay accesos</h2><p>Los próximos inicios de sesión aparecerán aquí.</p></div>}
    {groups.map(([day, group]) => <section key={day} className={styles.group} aria-label={group.label}>
      <h2 className={styles.day}>{group.label}</h2>
      <ul className={styles.list}>{group.rows.map(row => <li key={row.id} className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.avatar} aria-hidden>{(row.usuario.trim()[0] || "?").toLocaleUpperCase("es")}</span>
          <strong className={styles.user}>{row.usuario}</strong>
          <time className={styles.time} dateTime={row.logged_at} aria-label={`${loginLogTime(row.logged_at)}, hora de Costa Rica`}>{loginLogTime(row.logged_at)}</time>
        </div>
        <div className={styles.details}>
          <span className={styles.method} aria-label={`Método: ${loginLogMethod(row.metodo)}`}>
            {row.metodo === "google" ? <GoogleIcon size={14} /> : row.metodo === "authenticator" ? <ShieldCheck size={14} aria-hidden /> : <KeyRound size={14} aria-hidden />}
            {loginLogMethod(row.metodo)}
          </span>
          <span className={styles.ip}><Globe2 size={14} aria-hidden /><span><span className={styles.ipLabel}>IP </span>{row.ip_address || "No registrada"}</span></span>
        </div>
      </li>)}</ul>
    </section>)}
    {snapshot?.nextCursor && <button type="button" className={styles.more} disabled={loading || loadingMore || !online} onClick={() => void loadMore()}>{loadingMore ? "Cargando…" : "Ver anteriores"}</button>}
  </section>;
}
