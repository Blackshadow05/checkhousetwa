"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFechasConMenu, guardarMenusEscaneados } from "@/app/actions/menus";
import { normalizarMenusEscaneados, type MenuEscaneado } from "@/lib/menu-scan";
import { prepararImagenMenu } from "@/lib/menu-scan-image";
import { useOnline } from "@/lib/use-online";

export type FaseEscaneoMenu = "vacio" | "leyendo" | "error" | "revisando" | "guardando" | "guardado";

type Estado = {
  fase: FaseEscaneoMenu;
  fotoUrl: string | null;
  dias: MenuEscaneado[];
  elegidos: string[];
  existentes: string[];
  error: string;
  resultado: { guardados: number; reemplazados: number } | null;
};

const INICIAL: Estado = { fase: "vacio", fotoUrl: null, dias: [], elegidos: [], existentes: [], error: "", resultado: null };
const LECTURA_MAX_MS = 60_000;

export function useEscanearMenu() {
  const online = useOnline();
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const ticket = useRef(0);
  const archivo = useRef<File | null>(null);
  const imagen = useRef<Blob | null>(null);
  const urlFoto = useRef<string | null>(null);
  const controlador = useRef<AbortController | null>(null);
  const guardandoAhora = useRef(false);
  const reanudarAlConectar = useRef(false);

  const leer = useCallback(async (id: number) => {
    const fallo = (texto: string, sinConexion = false) => {
      if (ticket.current !== id) return;
      reanudarAlConectar.current = sinConexion;
      setEstado((previo) => ({ ...previo, fase: "error", error: texto }));
    };
    const controller = new AbortController();
    controlador.current = controller;
    let agotado = false;
    const timer = window.setTimeout(() => {
      agotado = true;
      controller.abort();
    }, LECTURA_MAX_MS);
    try {
      const file = archivo.current;
      if (!file) return;
      if (!imagen.current) {
        try {
          imagen.current = await prepararImagenMenu(file);
        } catch {
          fallo("No pudimos preparar esta foto. Prueba con otra imagen.");
          return;
        }
        if (ticket.current !== id) return;
      }
      if (!navigator.onLine) {
        fallo("Sin conexión. Conéctate para leer el menú.", true);
        return;
      }
      const response = await fetch("/api/menus/escanear", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: imagen.current,
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      if (ticket.current !== id) return;
      if (!response.ok) {
        const mensaje = (data as { error?: unknown } | null)?.error;
        fallo(typeof mensaje === "string" && mensaje ? mensaje : "No se pudo leer la imagen. Inténtalo de nuevo.");
        return;
      }
      const menus = normalizarMenusEscaneados(data);
      if (!menus.length) {
        fallo("No encontramos un menú en la imagen. Prueba con otra foto.");
        return;
      }
      setEstado((previo) => ({ ...previo, fase: "revisando", dias: menus, elegidos: menus.map((menu) => menu.fecha), existentes: [], error: "" }));
      void fetchFechasConMenu(menus.map((menu) => menu.fecha))
        .then((result) => {
          if (ticket.current === id && !result.error) setEstado((previo) => ({ ...previo, existentes: result.fechas }));
        })
        .catch(() => undefined);
    } catch {
      if (controller.signal.aborted && !agotado) return;
      if (agotado) fallo("La lectura tardó demasiado. Inténtalo de nuevo.");
      else if (!navigator.onLine) fallo("Sin conexión. Conéctate para leer el menú.", true);
      else fallo("No se pudo leer la imagen. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const elegir = useCallback((file: File | null | undefined) => {
    if (!file) return;
    controlador.current?.abort();
    const id = ++ticket.current;
    if (urlFoto.current) URL.revokeObjectURL(urlFoto.current);
    urlFoto.current = URL.createObjectURL(file);
    archivo.current = file;
    imagen.current = null;
    reanudarAlConectar.current = false;
    setEstado({ ...INICIAL, fase: "leyendo", fotoUrl: urlFoto.current });
    void leer(id);
  }, [leer]);

  const reintentar = useCallback(() => {
    if (!archivo.current) return;
    controlador.current?.abort();
    const id = ++ticket.current;
    reanudarAlConectar.current = false;
    setEstado((previo) => ({ ...previo, fase: "leyendo", error: "" }));
    void leer(id);
  }, [leer]);

  const descartar = useCallback(() => {
    if (guardandoAhora.current) return;
    controlador.current?.abort();
    ticket.current += 1;
    if (urlFoto.current) URL.revokeObjectURL(urlFoto.current);
    urlFoto.current = null;
    archivo.current = null;
    imagen.current = null;
    reanudarAlConectar.current = false;
    setEstado(INICIAL);
  }, []);

  const alternar = useCallback((fecha: string) => {
    setEstado((previo) => previo.fase !== "revisando" ? previo : {
      ...previo,
      error: "",
      elegidos: previo.elegidos.includes(fecha) ? previo.elegidos.filter((item) => item !== fecha) : [...previo.elegidos, fecha],
    });
  }, []);

  const guardar = useCallback(async () => {
    if (estado.fase !== "revisando" || guardandoAhora.current) return;
    const dias = estado.dias.filter((dia) => estado.elegidos.includes(dia.fecha));
    if (!dias.length) return;
    if (!navigator.onLine) {
      setEstado((previo) => ({ ...previo, error: "Sin conexión. Conéctate para guardar el menú." }));
      return;
    }
    guardandoAhora.current = true;
    const id = ticket.current;
    setEstado((previo) => ({ ...previo, fase: "guardando", error: "" }));
    try {
      const result = await guardarMenusEscaneados(dias.map(({ fecha, comidas }) => ({ fecha, comidas })));
      if (ticket.current !== id) return;
      if (result.error !== null) {
        const mensaje = result.error;
        setEstado((previo) => ({ ...previo, fase: "revisando", error: mensaje }));
        return;
      }
      setEstado((previo) => ({ ...previo, fase: "guardado", error: "", resultado: { guardados: result.guardados, reemplazados: result.reemplazados } }));
      window.dispatchEvent(new Event("casitas:menus-actualizados"));
    } catch {
      if (ticket.current === id) {
        setEstado((previo) => ({ ...previo, fase: "revisando", error: "No se pudo guardar el menú. Revisa tu conexión e inténtalo de nuevo." }));
      }
    } finally {
      guardandoAhora.current = false;
    }
  }, [estado.fase, estado.dias, estado.elegidos]);

  useEffect(() => {
    const reanudar = () => {
      if (!reanudarAlConectar.current) return;
      reintentar();
    };
    window.addEventListener("online", reanudar);
    return () => window.removeEventListener("online", reanudar);
  }, [reintentar]);

  useEffect(() => () => {
    controlador.current?.abort();
    if (urlFoto.current) URL.revokeObjectURL(urlFoto.current);
  }, []);

  return { ...estado, online, elegir, reintentar, descartar, alternar, guardar };
}
