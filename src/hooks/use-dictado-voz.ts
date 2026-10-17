"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ResultadoVoz = { isFinal: boolean; 0: { transcript: string } };
type EventoResultadoVoz = Event & { resultIndex: number; results: ArrayLike<ResultadoVoz> };
type EventoErrorVoz = Event & { error: string };

interface ReconocimientoVoz extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: EventoResultadoVoz) => void) | null;
  onerror: ((event: EventoErrorVoz) => void) | null;
  onend: (() => void) | null;
}

type ReconocimientoVozConstructor = new () => ReconocimientoVoz;

declare global {
  interface Window {
    SpeechRecognition?: ReconocimientoVozConstructor;
    webkitSpeechRecognition?: ReconocimientoVozConstructor;
  }
}

const IDIOMA_PRINCIPAL = "es-CR";
const IDIOMA_RESPALDO = "es-ES";
const DURACION_ERROR_MS = 4000;
const TIMEOUT_DETENER_MS = 1500;

const MENSAJES_ERROR: Record<string, string> = {
  "not-allowed": "Permiso de micrófono denegado",
  "service-not-allowed": "Permiso de micrófono denegado",
  "no-speech": "No se detectó voz",
  "audio-capture": "No se detectó micrófono",
  network: "Error de conexión",
};

function obtenerConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function limpiarHandlers(instancia: ReconocimientoVoz) {
  instancia.onstart = null;
  instancia.onresult = null;
  instancia.onerror = null;
  instancia.onend = null;
}

export function useDictadoVoz(onTexto: (texto: string) => void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconocimiento = useRef<ReconocimientoVoz | null>(null);
  const iniciando = useRef(false);
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detenerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextoRef = useRef(onTexto);

  useEffect(() => {
    onTextoRef.current = onTexto;
  }, [onTexto]);

  const limpiarTimeoutDetener = useCallback(() => {
    if (detenerTimeout.current) {
      clearTimeout(detenerTimeout.current);
      detenerTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    setSoportado(obtenerConstructor() !== null);
    return () => {
      limpiarTimeoutDetener();
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
      if (reconocimiento.current) {
        reconocimiento.current.abort();
        limpiarHandlers(reconocimiento.current);
        reconocimiento.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mostrarError = useCallback((mensaje: string) => {
    setError(mensaje);
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), DURACION_ERROR_MS);
  }, []);

  const iniciar = useCallback(function iniciar(textoBase: string, idioma: string) {
    if (iniciando.current) return;
    const Constructor = obtenerConstructor();
    if (!Constructor) return;

    if (reconocimiento.current) {
      limpiarTimeoutDetener();
      reconocimiento.current.abort();
      limpiarHandlers(reconocimiento.current);
      reconocimiento.current = null;
    }

    iniciando.current = true;
    const instancia = new Constructor();
    instancia.lang = idioma;
    instancia.interimResults = true;
    instancia.continuous = false;

    instancia.onstart = () => {
      if (reconocimiento.current !== instancia) return;
      iniciando.current = false;
      setEscuchando(true);
    };
    instancia.onresult = (event) => {
      if (reconocimiento.current !== instancia) return;
      let textoFinal = "";
      let textoInterino = "";
      for (let i = 0; i < event.results.length; i++) {
        const resultado = event.results[i];
        const transcripcion = resultado[0].transcript.trim();
        if (!transcripcion) continue;
        if (resultado.isFinal) {
          if (textoFinal && transcripcion.startsWith(textoFinal)) textoFinal = transcripcion;
          else textoFinal = textoFinal ? `${textoFinal} ${transcripcion}` : transcripcion;
        } else {
          textoInterino = textoInterino ? `${textoInterino} ${transcripcion}` : transcripcion;
        }
      }
      onTextoRef.current([textoBase.trimEnd(), textoFinal, textoInterino].filter(Boolean).join(" "));
    };
    instancia.onerror = (event) => {
      if (reconocimiento.current !== instancia) return;
      limpiarTimeoutDetener();
      limpiarHandlers(instancia);
      reconocimiento.current = null;
      iniciando.current = false;
      if (event.error === "language-not-supported" && idioma !== IDIOMA_RESPALDO) {
        iniciar(textoBase, IDIOMA_RESPALDO);
        return;
      }
      setEscuchando(false);
      const mensaje = MENSAJES_ERROR[event.error];
      if (mensaje) mostrarError(mensaje);
    };
    instancia.onend = () => {
      if (reconocimiento.current !== instancia) return;
      limpiarTimeoutDetener();
      limpiarHandlers(instancia);
      reconocimiento.current = null;
      iniciando.current = false;
      setEscuchando(false);
    };

    reconocimiento.current = instancia;
    try {
      instancia.start();
    } catch {
      limpiarHandlers(instancia);
      reconocimiento.current = null;
      iniciando.current = false;
      setEscuchando(false);
      mostrarError("No se pudo iniciar el dictado");
    }
  }, [mostrarError, limpiarTimeoutDetener]);

  const detener = useCallback(() => {
    const instancia = reconocimiento.current;
    if (!instancia) return;
    limpiarTimeoutDetener();
    try {
      instancia.stop();
    } catch {
      // ignorado: puede fallar si ya se detuvo
    }
    detenerTimeout.current = setTimeout(() => {
      detenerTimeout.current = null;
      if (reconocimiento.current === instancia) {
        instancia.abort();
        limpiarHandlers(instancia);
        reconocimiento.current = null;
      }
      iniciando.current = false;
      setEscuchando(false);
    }, TIMEOUT_DETENER_MS);
  }, [limpiarTimeoutDetener]);

  const alternar = useCallback((textoActual: string) => {
    if (reconocimiento.current) {
      detener();
      return;
    }
    if (iniciando.current) return;
    setError(null);
    iniciar(textoActual, IDIOMA_PRINCIPAL);
  }, [iniciar, detener]);

  return { soportado, escuchando, error, alternar };
}
