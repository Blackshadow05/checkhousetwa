"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBusquedaRevisiones } from "@/app/actions/revisiones";
import { quitarFiltro, type FiltrosSerializados } from "@/lib/busqueda-filtros";
import type { InicioRevisionRow } from "@/types/database";

export type BusquedaInteligente =
  | { pregunta: string; estado: "buscando" }
  | {
    pregunta: string;
    estado: "lista";
    respuesta: string | null;
    filtros: FiltrosSerializados | null;
    total: number;
    revisiones: InicioRevisionRow[];
    cargandoMas: boolean;
    errorMas: string | null;
    // Tras quitar un chip la respuesta del modelo ya no describe la lista.
    ajustada: boolean;
    ajustando: boolean;
    errorAjuste: string | null;
  }
  | { pregunta: string; estado: "error"; error: string };

export function esPreguntaNatural(texto: string) {
  return texto.trim().split(/\s+/).filter(Boolean).length >= 3;
}

export function useBusquedaInteligente() {
  const [busqueda, setBusqueda] = useState<BusquedaInteligente | null>(null);
  const controller = useRef<AbortController | null>(null);
  const actual = useRef<BusquedaInteligente | null>(null);
  const cargando = useRef(false);

  useEffect(() => {
    actual.current = busqueda;
  }, [busqueda]);

  useEffect(() => () => controller.current?.abort(), []);

  const preguntar = useCallback(async (texto: string) => {
    const pregunta = texto.replace(/\s+/g, " ").trim();
    if (pregunta.length < 3) return;
    controller.current?.abort();
    const peticion = new AbortController();
    controller.current = peticion;
    setBusqueda({ pregunta, estado: "buscando" });
    try {
      const response = await fetch("/api/revisiones/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta }),
        signal: peticion.signal,
      });
      const body = await response.json().catch(() => null) as
        { respuesta?: string | null; filtros?: FiltrosSerializados | null; total?: number; revisiones?: InicioRevisionRow[]; error?: string } | null;
      if (peticion.signal.aborted) return;
      if (!response.ok || !body) {
        setBusqueda({ pregunta, estado: "error", error: body?.error ?? "No pudimos completar la búsqueda." });
        return;
      }
      const revisiones = Array.isArray(body.revisiones) ? body.revisiones : [];
      setBusqueda({
        pregunta,
        estado: "lista",
        respuesta: typeof body.respuesta === "string" ? body.respuesta : null,
        filtros: body.filtros ?? null,
        total: typeof body.total === "number" ? body.total : revisiones.length,
        revisiones,
        cargandoMas: false,
        errorMas: null,
        ajustada: false,
        ajustando: false,
        errorAjuste: null,
      });
    } catch {
      if (peticion.signal.aborted) return;
      setBusqueda({ pregunta, estado: "error", error: "No pudimos conectar para buscar. Revisa la conexión." });
    }
  }, []);

  const cargarMas = useCallback(async () => {
    const inicial = actual.current;
    if (cargando.current || inicial?.estado !== "lista" || inicial.ajustando || inicial.revisiones.length >= inicial.total) return;
    cargando.current = true;
    const peticion = controller.current;
    setBusqueda({ ...inicial, cargandoMas: true, errorMas: null });
    const { rows, error } = await fetchBusquedaRevisiones(inicial.filtros, inicial.revisiones.length)
      .then((resultado) => resultado.error ? { ...resultado, error: "No pudimos cargar más revisiones." } : resultado)
      .catch(() => ({ rows: [] as InicioRevisionRow[], error: "No pudimos cargar más revisiones." }));
    cargando.current = false;
    if (controller.current !== peticion || peticion?.signal.aborted) return;
    setBusqueda((previa) => {
      if (previa?.estado !== "lista" || previa.pregunta !== inicial.pregunta) return previa;
      const ids = new Set(previa.revisiones.map((row) => row.id));
      const nuevas = rows.filter((row) => !ids.has(row.id));
      return {
        ...previa,
        cargandoMas: false,
        errorMas: error,
        revisiones: [...previa.revisiones, ...nuevas],
        total: !error && !nuevas.length ? previa.revisiones.length : previa.total,
      };
    });
  }, []);

  // Se permite quitar todos los chips: sin filtros la lista muestra todas las revisiones, igual que el archivo.
  const quitar = useCallback(async (id: string) => {
    const inicial = actual.current;
    if (inicial?.estado !== "lista" || !inicial.filtros || inicial.ajustando) return;
    controller.current?.abort();
    const peticion = new AbortController();
    controller.current = peticion;
    const filtros = quitarFiltro(inicial.filtros, id);
    setBusqueda({ ...inicial, ajustando: true, errorAjuste: null });
    const { rows, total, error } = await fetchBusquedaRevisiones(filtros, 0)
      .catch(() => ({ rows: [] as InicioRevisionRow[], total: 0, error: "No pudimos ajustar los filtros." }));
    if (controller.current !== peticion || peticion.signal.aborted) return;
    setBusqueda((previa) => {
      if (previa?.estado !== "lista" || previa.pregunta !== inicial.pregunta) return previa;
      if (error) return { ...previa, ajustando: false, cargandoMas: false, errorAjuste: "No pudimos ajustar los filtros. Inténtalo de nuevo." };
      return {
        ...previa,
        filtros,
        revisiones: rows,
        total,
        respuesta: null,
        ajustada: true,
        ajustando: false,
        errorAjuste: null,
        cargandoMas: false,
        errorMas: null,
      };
    });
  }, []);

  const cerrar = useCallback(() => {
    controller.current?.abort();
    setBusqueda(null);
  }, []);

  return { busqueda, preguntar, cargarMas, quitar, cerrar };
}
