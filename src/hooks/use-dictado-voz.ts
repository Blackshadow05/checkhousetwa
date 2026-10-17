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

export function useDictadoVoz(onTexto: (texto: string) => void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconocimiento = useRef<ReconocimientoVoz | null>(null);
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSoportado(obtenerConstructor() !== null);
    return () => {
      reconocimiento.current?.abort();
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
    };
  }, []);

  const mostrarError = useCallback((mensaje: string) => {
    setError(mensaje);
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), DURACION_ERROR_MS);
  }, []);

  const iniciar = useCallback(function iniciar(textoBase: string, idioma: string) {
    const Constructor = obtenerConstructor();
    if (!Constructor) return;
    const instancia = new Constructor();
    instancia.lang = idioma;
    instancia.interimResults = true;
    instancia.continuous = true;
    let textoFinal = "";
    instancia.onresult = (event) => {
      let textoInterino = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultado = event.results[i];
        const transcripcion = resultado[0].transcript.trim();
        if (!transcripcion) continue;
        if (resultado.isFinal) textoFinal = textoFinal ? `${textoFinal} ${transcripcion}` : transcripcion;
        else textoInterino = textoInterino ? `${textoInterino} ${transcripcion}` : transcripcion;
      }
      onTexto([textoBase.trimEnd(), textoFinal, textoInterino].filter(Boolean).join(" "));
    };
    instancia.onerror = (event) => {
      if (reconocimiento.current !== instancia) return;
      if (event.error === "language-not-supported" && idioma !== IDIOMA_RESPALDO) {
        reconocimiento.current = null;
        iniciar(textoBase, IDIOMA_RESPALDO);
        return;
      }
      reconocimiento.current = null;
      setEscuchando(false);
      const mensaje = MENSAJES_ERROR[event.error];
      if (mensaje) mostrarError(mensaje);
    };
    instancia.onend = () => {
      if (reconocimiento.current !== instancia) return;
      reconocimiento.current = null;
      setEscuchando(false);
    };
    reconocimiento.current = instancia;
    setEscuchando(true);
    try {
      instancia.start();
    } catch {
      reconocimiento.current = null;
      setEscuchando(false);
      mostrarError("No se pudo iniciar el dictado");
    }
  }, [onTexto, mostrarError]);

  const alternar = useCallback((textoActual: string) => {
    if (reconocimiento.current) {
      reconocimiento.current.stop();
      return;
    }
    setError(null);
    iniciar(textoActual, IDIOMA_PRINCIPAL);
  }, [iniciar]);

  return { soportado, escuchando, error, alternar };
}
