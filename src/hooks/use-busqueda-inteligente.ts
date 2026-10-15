"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InicioRevisionRow } from "@/types/database";

export type BusquedaInteligente =
  | { pregunta: string; estado: "buscando" }
  | { pregunta: string; estado: "lista"; respuesta: string | null; revisiones: InicioRevisionRow[] }
  | { pregunta: string; estado: "error"; error: string };

export function esPreguntaNatural(texto: string) {
  return texto.trim().split(/\s+/).filter(Boolean).length >= 3;
}

export function useBusquedaInteligente() {
  const [busqueda, setBusqueda] = useState<BusquedaInteligente | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const preguntar = useCallback(async (texto: string) => {
    const pregunta = texto.replace(/\s+/g, " ").trim();
    if (pregunta.length < 3) return;
    controller.current?.abort();
    const actual = new AbortController();
    controller.current = actual;
    setBusqueda({ pregunta, estado: "buscando" });
    try {
      const response = await fetch("/api/revisiones/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta }),
        signal: actual.signal,
      });
      const body = await response.json().catch(() => null) as
        { respuesta?: string | null; revisiones?: InicioRevisionRow[]; error?: string } | null;
      if (actual.signal.aborted) return;
      if (!response.ok || !body) {
        setBusqueda({ pregunta, estado: "error", error: body?.error ?? "No pudimos completar la búsqueda." });
        return;
      }
      setBusqueda({
        pregunta,
        estado: "lista",
        respuesta: typeof body.respuesta === "string" ? body.respuesta : null,
        revisiones: Array.isArray(body.revisiones) ? body.revisiones : [],
      });
    } catch {
      if (actual.signal.aborted) return;
      setBusqueda({ pregunta, estado: "error", error: "No pudimos conectar para buscar. Revisa la conexión." });
    }
  }, []);

  const cerrar = useCallback(() => {
    controller.current?.abort();
    setBusqueda(null);
  }, []);

  return { busqueda, preguntar, cerrar };
}
