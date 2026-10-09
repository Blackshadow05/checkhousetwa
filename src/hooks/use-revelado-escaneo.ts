"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RevisionPhotoScan } from "@/lib/revision-form";

export type FaseRevelado = "crece" | "escanea" | "encoge";

const DURACION = { crece: 260, escanea: 800, encoge: 420 } as const;
const MOVIMIENTO_REDUCIDO = "(prefers-reduced-motion: reduce)";

type Actual = { id: string; fase: FaseRevelado; minimo: boolean };

function suscribirMovimiento(callback: () => void) {
  const query = window.matchMedia(MOVIMIENTO_REDUCIDO);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function agregar(set: ReadonlySet<string>, ids: readonly string[]) {
  return new Set([...set, ...ids]);
}

export function useReveladoEscaneo(photoIds: readonly string[], escaneos: Record<string, RevisionPhotoScan> | undefined, fallidas: Record<string, string>) {
  const reducido = useSyncExternalStore(suscribirMovimiento, () => window.matchMedia(MOVIMIENTO_REDUCIDO).matches, () => false);
  const [vistos, setVistos] = useState<ReadonlySet<string>>(() => new Set());
  const [revelados, setRevelados] = useState<ReadonlySet<string>>(() => new Set());
  const [actual, setActual] = useState<Actual | null>(null);
  const conResultado = (id: string) => Boolean(escaneos?.[id] || fallidas[id]);

  const nuevos = photoIds.filter((id) => !vistos.has(id));
  if (nuevos.length) {
    setVistos(agregar(vistos, nuevos));
    const previos = nuevos.filter((id) => escaneos?.[id]);
    if (previos.length) setRevelados((previous) => agregar(previous, previos));
  }

  const pendientes = photoIds.filter((id) => !revelados.has(id) || !conResultado(id));
  const objetivo = pendientes[0] ?? null;

  if (reducido) {
    const listos = pendientes.filter(conResultado);
    if (listos.length) setRevelados((previous) => agregar(previous, listos));
    if (actual) setActual(null);
  } else if (!objetivo) {
    if (actual) setActual(null);
  } else if (actual?.id !== objetivo) {
    setActual({ id: objetivo, fase: "crece", minimo: false });
  } else if (actual.fase === "escanea" && actual.minimo && conResultado(actual.id)) {
    setActual({ ...actual, fase: "encoge" });
  }

  useEffect(() => {
    if (!actual) return;
    const { id, fase } = actual;
    if (fase === "escanea" && actual.minimo) return;
    const timer = window.setTimeout(() => {
      if (fase === "crece") setActual({ id, fase: "escanea", minimo: false });
      else if (fase === "escanea") setActual((previous) => previous?.id === id ? { ...previous, minimo: true } : previous);
      else {
        setRevelados((previous) => agregar(previous, [id]));
        setActual(null);
      }
    }, DURACION[fase]);
    return () => window.clearTimeout(timer);
  }, [actual]);

  const activo = pendientes.length > 0;
  const escaneado = photoIds.some((id) => escaneos?.[id]);
  const huboLote = useRef(false);
  useEffect(() => {
    if (activo) {
      huboLote.current = true;
      return;
    }
    if (!huboLote.current) return;
    huboLote.current = false;
    if (escaneado && document.visibilityState === "visible") navigator.vibrate?.(12);
  }, [activo, escaneado]);

  const actualVisible = actual && actual.id === objetivo ? actual : null;
  return {
    activo,
    animando: actualVisible !== null,
    fase: (id: string) => actualVisible?.id === id ? actualVisible.fase : null,
    revelado: (id: string) => !pendientes.includes(id),
    progreso: activo ? { actual: Math.max(1, photoIds.indexOf(objetivo ?? "") + 1), total: photoIds.length } : null,
  };
}
