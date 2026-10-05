"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Download, Eraser, Images, LoaderCircle, Share2, Sparkles, TriangleAlert, X } from "lucide-react";
import { SegmentIndicator } from "@/components/ui/segment-indicator";
import { quitarFondoLocal, TOLERANCIA_INICIAL, TOLERANCIA_MAX, TOLERANCIA_MIN } from "@/lib/quitar-fondo";
import { revisionPhotoDimensions } from "@/lib/revision-photo-format";
import { useOnline } from "@/lib/use-online";
import styles from "./escanear-menu-screen.module.css";
import own from "./editar-imagen-screen.module.css";

const LOCAL_MAX_SIDE = 1600;
const IA_MAX_SIDE = 1024;
const IA_MAX_MS = 120_000;
const NOMBRE = "sin-fondo.png";

type Vista = "local" | "ia";
type Resultado = { url: string; blob: Blob };
type FaseIa = "nada" | "procesando" | "error" | "listo";

async function cargarImagen(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function lienzo(image: HTMLImageElement, maxSide: number, relleno?: string) {
  const { width, height } = revisionPhotoDimensions(image.naturalWidth, image.naturalHeight, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas");
  if (relleno) { context.fillStyle = relleno; context.fillRect(0, 0, width, height); }
  context.drawImage(image, 0, 0, width, height);
  return { canvas, context };
}

function aBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("encode"))), type, quality));
}

export function EditarImagenFeature({ onOpen }: { onOpen: () => void }) {
  return <button type="button" className="pantalla-feature" onClick={onOpen}>
    <span className="pantalla-feature-icon"><Eraser size={27} aria-hidden /></span>
    <span><strong>Editar imagen</strong><small>Quitar el fondo conservando sujeto y letras</small></span>
    <ArrowRight size={21} aria-hidden />
  </button>;
}

export function EditarImagenScreen({ onBack }: { onBack: () => void }) {
  const online = useOnline();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const ticket = useRef(0);
  const imagen = useRef<HTMLImageElement | null>(null);
  const fuente = useRef<ImageData | null>(null);
  const salida = useRef<HTMLCanvasElement | null>(null);
  const controlador = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const ultimoLocal = useRef<string | undefined>(undefined);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [tolerancia, setTolerancia] = useState(TOLERANCIA_INICIAL);
  const [local, setLocal] = useState<Resultado | null>(null);
  const [vista, setVista] = useState<Vista>("local");
  const [faseIa, setFaseIa] = useState<FaseIa>("nada");
  const [ia, setIa] = useState<Resultado | null>(null);
  const [errorIa, setErrorIa] = useState("");
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  const crearUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  };
  const soltarUrl = (url: string | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  const renderLocal = useCallback(async (valor: number, id: number) => {
    const data = fuente.current;
    const canvas = salida.current;
    if (!data || !canvas) return;
    canvas.getContext("2d")?.putImageData(quitarFondoLocal(data, valor), 0, 0);
    const blob = await aBlob(canvas, "image/png");
    if (ticket.current !== id) return;
    const url = crearUrl(blob);
    soltarUrl(ultimoLocal.current);
    ultimoLocal.current = url;
    setLocal({ url, blob });
    setPuedeCompartir(typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([blob], NOMBRE, { type: "image/png" })] }));
  }, []);

  useEffect(() => {
    if (!listo) return;
    const id = ticket.current;
    const timer = window.setTimeout(() => { void renderLocal(tolerancia, id).catch(() => undefined); }, 90);
    return () => window.clearTimeout(timer);
  }, [listo, tolerancia, renderLocal]);

  const reiniciar = () => {
    controlador.current?.abort();
    ticket.current += 1;
    imagen.current = null;
    fuente.current = null;
    salida.current = null;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    ultimoLocal.current = undefined;
    setListo(false); setCargando(false); setError("");
    setLocal(null); setIa(null); setFaseIa("nada"); setErrorIa(""); setVista("local");
  };

  const elegir = async (file: File | null | undefined) => {
    if (!file) return;
    reiniciar();
    const id = ticket.current;
    setCargando(true);
    try {
      const image = await cargarImagen(file);
      if (ticket.current !== id) return;
      const { canvas, context } = lienzo(image, LOCAL_MAX_SIDE);
      imagen.current = image;
      fuente.current = context.getImageData(0, 0, canvas.width, canvas.height);
      salida.current = canvas;
      setTolerancia(TOLERANCIA_INICIAL);
      setListo(true);
    } catch {
      if (ticket.current === id) setError("No pudimos abrir esta imagen. Prueba con otra.");
    } finally {
      if (ticket.current === id) setCargando(false);
    }
  };

  const probarIa = async () => {
    const image = imagen.current;
    if (!image) return;
    controlador.current?.abort();
    const id = ticket.current;
    const controller = new AbortController();
    controlador.current = controller;
    let agotado = false;
    const timer = window.setTimeout(() => { agotado = true; controller.abort(); }, IA_MAX_MS);
    const fallo = (texto: string) => {
      if (ticket.current !== id) return;
      setErrorIa(texto);
      setFaseIa("error");
    };
    setVista("ia"); setFaseIa("procesando"); setErrorIa("");
    try {
      if (!navigator.onLine) { fallo("Sin conexión. Conéctate para usar OpenAI."); return; }
      const body = await aBlob(lienzo(image, IA_MAX_SIDE, "#ffffff").canvas, "image/jpeg", 0.9);
      const response = await fetch("/api/imagenes/quitar-fondo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body, signal: controller.signal });
      if (ticket.current !== id) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
        fallo(typeof data?.error === "string" && data.error ? data.error : "No se pudo editar la imagen. Inténtalo de nuevo.");
        return;
      }
      const blob = await response.blob();
      if (ticket.current !== id) return;
      const url = crearUrl(blob);
      setIa({ url, blob });
      setFaseIa("listo");
    } catch {
      if (controller.signal.aborted && !agotado) return;
      if (agotado) fallo("OpenAI tardó demasiado. Inténtalo de nuevo.");
      else if (!navigator.onLine) fallo("Sin conexión. Conéctate para usar OpenAI.");
      else fallo("No se pudo editar la imagen. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      window.clearTimeout(timer);
    }
  };

  const actual = vista === "ia" ? ia : local;

  const compartir = async () => {
    if (!actual) return;
    try {
      await navigator.share({ files: [new File([actual.blob], NOMBRE, { type: "image/png" })] });
    } catch {
      return;
    }
  };

  useEffect(() => {
    const abiertas = urls.current;
    return () => {
      controlador.current?.abort();
      for (const url of abiertas) URL.revokeObjectURL(url);
    };
  }, []);

  const abierto = listo || cargando || !!error;
  const procesandoIa = vista === "ia" && faseIa === "procesando";

  return <section className={styles.screen} aria-label="Editar imagen">
    <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={18} aria-hidden />Otros</button>
    <div className={styles.header}>
      <h1>Editar imagen</h1>
      {abierto && <button type="button" className={styles.close} aria-label="Descartar y empezar de nuevo" onClick={reiniciar}><X size={20} aria-hidden /></button>}
    </div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Tomar foto" onChange={event => { void elegir(event.target.files?.[0]); event.target.value = ""; }} />
    <input ref={library} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden aria-label="Elegir imagen" onChange={event => { void elegir(event.target.files?.[0]); event.target.value = ""; }} />

    {!abierto && <div className={styles.start}>
      <span className={styles.mark} aria-hidden><Eraser size={38} strokeWidth={1.6} /></span>
      <p className={own.hint}>Quita el fondo y conserva el sujeto y las letras. Funciona mejor con fondos lisos.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => library.current?.click()}><Images size={21} aria-hidden />Elegir imagen</button>
        <button type="button" className={styles.secondary} onClick={() => camera.current?.click()}><Camera size={21} aria-hidden />Tomar foto</button>
      </div>
    </div>}

    {error && <>
      <p className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden /><span>{error}</span></p>
      <div className={styles.actions}><button type="button" className={styles.primary} onClick={() => library.current?.click()}>Elegir otra</button></div>
    </>}

    {(cargando || listo) && <>
      {faseIa !== "nada" && <div className="pantalla-tabs" aria-label="Resultado">
        <SegmentIndicator activeIndex={vista === "local" ? 0 : 1} />
        <button type="button" aria-pressed={vista === "local"} onClick={() => setVista("local")}>Sin IA</button>
        <button type="button" aria-pressed={vista === "ia"} onClick={() => setVista("ia")}>OpenAI</button>
      </div>}
      <div className={`${styles.preview} ${own.checker}`}>
        {actual && <div className={styles.photo} style={{ backgroundImage: `url("${actual.url}")` }} role="img" aria-label="Imagen sin fondo" />}
        {(cargando || procesandoIa) && <span className={styles.sweep} aria-hidden />}
        {(cargando || procesandoIa) && <span className={styles.reading} role="status"><LoaderCircle size={17} className={styles.spin} aria-hidden />{cargando ? "Abriendo imagen…" : "OpenAI está quitando el fondo…"}</span>}
      </div>

      {vista === "local" && listo && <label className={own.slider}>
        <span><span>Sensibilidad</span><output>{tolerancia}</output></span>
        <input type="range" min={TOLERANCIA_MIN} max={TOLERANCIA_MAX} step={1} value={tolerancia} onChange={event => setTolerancia(Number(event.target.value))} />
        <small>Súbela si queda fondo; bájala si se borra parte del sujeto.</small>
      </label>}

      {vista === "ia" && faseIa === "error" && <>
        <p className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden /><span>{errorIa}</span></p>
        <div className={styles.actions}><button type="button" className={styles.secondary} disabled={!online} onClick={() => void probarIa()}>{online ? "Reintentar con OpenAI" : "Sin conexión"}</button></div>
      </>}

      {listo && <div className={styles.actions}>
        {actual && puedeCompartir && <button type="button" className={styles.primary} onClick={() => void compartir()}><Share2 size={21} aria-hidden />Compartir</button>}
        {actual && <a className={`${puedeCompartir ? styles.secondary : styles.primary} ${own.link}`} href={actual.url} download={NOMBRE}><Download size={21} aria-hidden />Guardar</a>}
        {faseIa === "nada" && <button type="button" className={styles.secondary} disabled={!online} onClick={() => void probarIa()}><Sparkles size={21} aria-hidden />{online ? "Probar con OpenAI" : "OpenAI requiere conexión"}</button>}
        <button type="button" className={styles.secondary} onClick={() => library.current?.click()}><Images size={21} aria-hidden />Otra imagen</button>
      </div>}
    </>}
  </section>;
}
