"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { crearDetector, entradaDesdeBlob, type DetectorArticulos, type EntradaDetector } from "@/lib/articulos-detector";
import { ARTICULOS_MODEL_ID } from "@/lib/articulos-model";
import { conEscaneo } from "@/lib/revision-scan";
import type { RevisionDraft } from "@/lib/revision-form";

type Sesion = { detector: DetectorArticulos; enCola: Set<string>; cola: Promise<void> };

export function useEscaneoArticulos(active: boolean, draft: RevisionDraft | null, update: (change: (draft: RevisionDraft) => RevisionDraft) => void) {
  const sesion = useRef<Sesion | null>(null);
  const entradas = useRef(new Map<string, EntradaDetector>());
  const draftRef = useRef(draft);
  const [fallidas, setFallidas] = useState<Record<string, string>>({});

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!active) return;
    const detector = crearDetector();
    const actual: Sesion = { detector, enCola: new Set(), cola: Promise.resolve() };
    const cache = entradas.current;
    sesion.current = actual;
    detector.precargar().catch(() => {});
    return () => {
      detector.cerrar();
      if (sesion.current === actual) sesion.current = null;
      cache.clear();
    };
  }, [active]);

  useEffect(() => {
    const actual = sesion.current;
    if (!active || !actual || !draft || draft.mode !== "reconocimiento") return;
    const draftId = draft.id;
    for (const photo of draft.photos) {
      if (draft.escaneos?.[photo.id] || fallidas[photo.id] || actual.enCola.has(photo.id)) continue;
      actual.enCola.add(photo.id);
      actual.cola = actual.cola.then(async () => {
        try {
          if (!draftRef.current?.photos.some((item) => item.id === photo.id)) return;
          const entrada = entradas.current.get(photo.id) ?? await entradaDesdeBlob(photo.blob);
          entradas.current.delete(photo.id);
          const resultado = await actual.detector.escanear(entrada);
          if (sesion.current !== actual) return;
          update((previous) => previous.id !== draftId || !previous.photos.some((item) => item.id === photo.id) ? previous : conEscaneo({
            ...previous,
            escaneos: { ...previous.escaneos, [photo.id]: { ...resultado, at: new Date().toISOString(), model: ARTICULOS_MODEL_ID } },
          }));
        } catch (error) {
          if (sesion.current !== actual) return;
          entradas.current.delete(photo.id);
          setFallidas((previous) => ({ ...previous, [photo.id]: error instanceof Error ? error.message : "No pudimos escanear esta foto." }));
        } finally {
          actual.enCola.delete(photo.id);
        }
      });
    }
  }, [active, draft, fallidas, update]);

  const registrar = useCallback((photoId: string, entrada: EntradaDetector | null) => {
    if (entrada) entradas.current.set(photoId, entrada);
  }, []);

  const reintentar = useCallback(() => setFallidas({}), []);

  return { fallidas, registrar, reintentar };
}
