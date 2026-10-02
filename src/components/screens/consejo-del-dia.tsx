"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Lightbulb } from "lucide-react";
import { fetchConsejosDiarios } from "@/app/actions/consejos-diarios";
import { CONSEJOS_DIARIOS, consejoDay, consejoForDay, nextConsejoDayDelay } from "@/lib/consejos-diarios";
import styles from "./inicio-screen.module.css";

function subscribeDay(callback: () => void) {
  let timer = 0;
  const update = () => {
    window.clearTimeout(timer);
    callback();
    timer = window.setTimeout(update, nextConsejoDayDelay());
  };
  timer = window.setTimeout(update, nextConsejoDayDelay());
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("focus", update);
    document.removeEventListener("visibilitychange", update);
  };
}

export function ConsejoDelDia({ initialDay, online, headingLevel = 1 }: {
  initialDay: string;
  online: boolean;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const day = useSyncExternalStore(subscribeDay, consejoDay, () => initialDay);
  const [catalog, setCatalog] = useState(CONSEJOS_DIARIOS);
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void fetchConsejosDiarios().then((data) => {
      if (!cancelled && data?.length) setCatalog(data);
    }).catch(() => {
      // Keep the bundled or last loaded catalog when the connection fails.
    });
    return () => { cancelled = true; };
  }, [online]);
  const tip = consejoForDay(day, catalog);
  return (
    <header className={`${styles.hero} ${styles.advice}`} aria-labelledby="daily-advice-title">
      <Heading id="daily-advice-title"><Lightbulb size={18} aria-hidden="true" />Consejo del día</Heading>
      <p>{tip.consejo}</p>
    </header>
  );
}
