"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type EstadoDictado = "inactivo" | "grabando" | "transcribiendo";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }
}

const TIPOS_AUDIO = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const MAX_SEGUNDOS = 120;
const MIN_DURACION_MS = 500;
const FRECUENCIA_WAV = 16_000;
const DURACION_ERROR_MS = 4000;
const SIN_VOZ = "No se escuchó nada.";
const ERROR_TRANSCRIPCION = "No se pudo transcribir el audio.";

const MENSAJES_ERROR: Record<string, string> = {
  NotAllowedError: "Permiso de micrófono denegado.",
  SecurityError: "Permiso de micrófono denegado.",
  NotFoundError: "No se encontró un micrófono.",
  OverconstrainedError: "No se encontró un micrófono.",
  NotReadableError: "El micrófono está en uso.",
};

function suscribirSinCambios() {
  return () => {};
}

function grabacionSoportada() {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

function elegirTipo() {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return TIPOS_AUDIO.find((tipo) => MediaRecorder.isTypeSupported(tipo));
}

function formatoDeTipo(tipo: string) {
  if (tipo.includes("mp4") || tipo.includes("aac")) return "m4a";
  if (tipo.includes("ogg")) return "ogg";
  return "webm";
}

function decodificar(contexto: BaseAudioContext, datos: ArrayBuffer) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    // Safari antiguo solo soporta la forma con callbacks; los demás devuelven además una promesa.
    const promesa = contexto.decodeAudioData(datos, resolve, reject) as Promise<AudioBuffer> | undefined;
    promesa?.then(resolve, reject);
  });
}

function renderizar(contexto: OfflineAudioContext) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    contexto.oncomplete = (event) => resolve(event.renderedBuffer);
    const promesa = contexto.startRendering() as Promise<AudioBuffer> | undefined;
    promesa?.then(resolve, reject);
  });
}

function codificarWav(muestras: Float32Array, frecuencia: number) {
  const vista = new DataView(new ArrayBuffer(44 + muestras.length * 2));
  const escribirTexto = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(offset + i, texto.charCodeAt(i));
  };
  escribirTexto(0, "RIFF");
  vista.setUint32(4, 36 + muestras.length * 2, true);
  escribirTexto(8, "WAVE");
  escribirTexto(12, "fmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, frecuencia, true);
  vista.setUint32(28, frecuencia * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  escribirTexto(36, "data");
  vista.setUint32(40, muestras.length * 2, true);
  for (let i = 0; i < muestras.length; i++) {
    const muestra = Math.max(-1, Math.min(1, muestras[i]));
    vista.setInt16(44 + i * 2, muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff, true);
  }
  return new Blob([vista], { type: "audio/wav" });
}

async function convertirAWav(audio: Blob) {
  const Contexto = window.AudioContext ?? window.webkitAudioContext;
  const ContextoOffline = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  if (!Contexto || !ContextoOffline) throw new Error("sin Web Audio");
  const contexto = new Contexto();
  let decodificado: AudioBuffer;
  try {
    decodificado = await decodificar(contexto, await audio.arrayBuffer());
  } finally {
    void contexto.close().catch(() => {});
  }
  const offline = new ContextoOffline(1, Math.max(1, Math.ceil(decodificado.duration * FRECUENCIA_WAV)), FRECUENCIA_WAV);
  const fuente = offline.createBufferSource();
  fuente.buffer = decodificado;
  fuente.connect(offline.destination);
  fuente.start(0);
  const mono = await renderizar(offline);
  return { wav: codificarWav(mono.getChannelData(0), FRECUENCIA_WAV), duracion: decodificado.duration };
}

export function agregarTexto(actual: string, nuevo: string) {
  const base = actual.trimEnd();
  return base ? `${base} ${nuevo}` : nuevo;
}

export function useDictadoVoz(onTranscripcion: (texto: string) => void) {
  const soportado = useSyncExternalStore(suscribirSinCambios, grabacionSoportada, () => false);
  const [estado, setEstado] = useState<EstadoDictado>("inactivo");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);
  const ocupado = useRef(false);
  const grabador = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDetener = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peticion = useRef<AbortController | null>(null);
  const onTranscripcionRef = useRef(onTranscripcion);

  useEffect(() => {
    onTranscripcionRef.current = onTranscripcion;
  }, [onTranscripcion]);

  const limpiarTemporizadores = useCallback(() => {
    if (intervalo.current) clearInterval(intervalo.current);
    if (autoDetener.current) clearTimeout(autoDetener.current);
    intervalo.current = null;
    autoDetener.current = null;
  }, []);

  const liberarMicrofono = useCallback(() => {
    flujo.current?.getTracks().forEach((pista) => pista.stop());
    flujo.current = null;
  }, []);

  const mostrarError = useCallback((mensaje: string) => {
    if (!montado.current) return;
    setError(mensaje);
    if (errorTimeout.current) clearTimeout(errorTimeout.current);
    errorTimeout.current = setTimeout(() => setError(null), DURACION_ERROR_MS);
  }, []);

  const finalizar = useCallback(() => {
    ocupado.current = false;
    if (montado.current) {
      setEstado("inactivo");
      setSegundos(0);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      limpiarTemporizadores();
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
      peticion.current?.abort();
      peticion.current = null;
      const instancia = grabador.current;
      grabador.current = null;
      if (instancia) {
        instancia.ondataavailable = null;
        instancia.onstop = null;
        if (instancia.state !== "inactive") {
          try {
            instancia.stop();
          } catch {
            // ignorado: ya detenido
          }
        }
      }
      liberarMicrofono();
      ocupado.current = false;
    };
  }, [limpiarTemporizadores, liberarMicrofono]);

  const transcribir = useCallback(async (audio: Blob, duracionMs: number) => {
    if (!audio.size || duracionMs < MIN_DURACION_MS) {
      mostrarError(SIN_VOZ);
      finalizar();
      return;
    }
    setEstado("transcribiendo");
    let envio: Blob = audio;
    let formato = formatoDeTipo(audio.type);
    try {
      const { wav, duracion } = await convertirAWav(audio);
      if (duracion * 1000 < MIN_DURACION_MS) {
        mostrarError(SIN_VOZ);
        finalizar();
        return;
      }
      envio = wav;
      formato = "wav";
    } catch {
      // se envía el audio original
    }
    if (!montado.current) return;

    const controlador = new AbortController();
    peticion.current = controlador;
    const datos = new FormData();
    datos.append("audio", envio, `dictado.${formato}`);
    datos.append("format", formato);
    try {
      const response = await fetch("/api/revisiones/transcribir", { method: "POST", body: datos, signal: controlador.signal });
      const body = await response.json().catch(() => null) as { texto?: unknown; error?: unknown } | null;
      if (!montado.current) return;
      if (!response.ok) {
        mostrarError(typeof body?.error === "string" && body.error ? body.error : ERROR_TRANSCRIPCION);
      } else {
        const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
        if (texto) onTranscripcionRef.current(texto);
        else mostrarError(SIN_VOZ);
      }
    } catch {
      if (!controlador.signal.aborted) mostrarError(ERROR_TRANSCRIPCION);
    } finally {
      if (peticion.current === controlador) peticion.current = null;
      finalizar();
    }
  }, [finalizar, mostrarError]);

  const detener = useCallback(() => {
    limpiarTemporizadores();
    const instancia = grabador.current;
    if (!instancia) return;
    // Si ya está inactivo, onstop está pendiente y se encargará de transcribir.
    if (instancia.state === "inactive") return;
    try {
      instancia.stop();
      return;
    } catch {
      // continúa limpiando abajo
    }
    grabador.current = null;
    liberarMicrofono();
    finalizar();
  }, [finalizar, limpiarTemporizadores, liberarMicrofono]);

  const iniciar = useCallback(async () => {
    ocupado.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!montado.current) {
        stream.getTracks().forEach((pista) => pista.stop());
        return;
      }
      flujo.current = stream;
      const tipo = elegirTipo();
      const instancia = tipo ? new MediaRecorder(stream, { mimeType: tipo }) : new MediaRecorder(stream);
      const partes: Blob[] = [];
      const inicio = Date.now();
      instancia.ondataavailable = (event) => {
        if (event.data.size) partes.push(event.data);
      };
      instancia.onstop = () => {
        limpiarTemporizadores();
        liberarMicrofono();
        if (grabador.current !== instancia) return;
        grabador.current = null;
        const audio = new Blob(partes, { type: instancia.mimeType || tipo || partes[0]?.type || "" });
        void transcribir(audio, Date.now() - inicio);
      };
      grabador.current = instancia;
      instancia.start(1000);
      setSegundos(0);
      setEstado("grabando");
      intervalo.current = setInterval(() => {
        setSegundos(Math.min(MAX_SEGUNDOS, Math.floor((Date.now() - inicio) / 1000)));
      }, 250);
      autoDetener.current = setTimeout(detener, MAX_SEGUNDOS * 1000);
    } catch (err) {
      grabador.current = null;
      limpiarTemporizadores();
      liberarMicrofono();
      const nombre = err instanceof Error ? err.name : "";
      mostrarError(MENSAJES_ERROR[nombre] ?? "No se pudo iniciar la grabación.");
      finalizar();
    }
  }, [detener, finalizar, limpiarTemporizadores, liberarMicrofono, mostrarError, transcribir]);

  const alternar = useCallback(() => {
    if (grabador.current) {
      detener();
      return;
    }
    if (ocupado.current || !grabacionSoportada()) return;
    void iniciar();
  }, [detener, iniciar]);

  return { soportado, estado, segundos, error, alternar };
}
