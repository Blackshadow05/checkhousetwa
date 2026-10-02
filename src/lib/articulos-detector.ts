import {
  ARTICULOS_CLASES,
  ARTICULOS_INPUT_SIZE,
  ARTICULOS_MODEL_URL,
  ARTICULOS_PAD_VALUE,
  ARTICULOS_GPU_WORKER_URL,
  ARTICULOS_WORKER_URL,
  contarCajas,
  type CajaDetectada,
} from "@/lib/articulos-model";
import type { RevisionScanBox } from "@/lib/revision-form";

const LOAD_TIMEOUT_MS = 180_000;
const IMAGE_TIMEOUT_MS = 60_000;

function usarGpu() {
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return apple && "gpu" in navigator;
}

type Marco = { x: number; y: number; width: number; height: number };
export type EntradaDetector = { image: ImageData; marco: Marco };
export type FotoDetectada = { counts: number[]; cajas: RevisionScanBox[] };
export type DetectorArticulos = {
  precargar: () => Promise<void>;
  escanear: (entrada: EntradaDetector) => Promise<FotoDetectada>;
  cerrar: () => void;
};

export function entradaDesdeImagen(source: CanvasImageSource, ancho: number, alto: number): EntradaDetector {
  const canvas = document.createElement("canvas");
  try {
    const size = ARTICULOS_INPUT_SIZE;
    const scale = Math.min(size / ancho, size / alto);
    const width = Math.round(ancho * scale);
    const height = Math.round(alto * scale);
    const x = Math.floor((size - width) / 2);
    const y = Math.floor((size - height) / 2);
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas");
    context.fillStyle = `rgb(${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE})`;
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(source, x, y, width, height);
    return { image: context.getImageData(0, 0, size, size), marco: { x, y, width, height } };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function entradaDesdeBlob(blob: Blob): Promise<EntradaDetector> {
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    return entradaDesdeImagen(image, image.naturalWidth, image.naturalHeight);
  } catch {
    throw new Error("No pudimos leer esta foto. Quítala y elige otra.");
  } finally {
    URL.revokeObjectURL(source);
  }
}

function limitar(value: number) {
  return Math.min(1, Math.max(0, value));
}

function cajasEnFoto(cajas: readonly CajaDetectada[], marco: Marco): RevisionScanBox[] {
  return cajas.flatMap((caja) => {
    const key = ARTICULOS_CLASES[caja.cls];
    if (!key) return [];
    const x1 = limitar((caja.x1 - marco.x) / marco.width);
    const y1 = limitar((caja.y1 - marco.y) / marco.height);
    const x2 = limitar((caja.x2 - marco.x) / marco.width);
    const y2 = limitar((caja.y2 - marco.y) / marco.height);
    return x2 > x1 && y2 > y1 ? [{ key, x: x1, y: y1, w: x2 - x1, h: y2 - y1 }] : [];
  });
}

type Espera<T> = { resolve: (value: T) => void; reject: (error: Error) => void; timer: number };
type Respuesta =
  | { type: "listo" }
  | { type: "error-carga"; error: string }
  | { type: "resultado"; id: number; cajas: CajaDetectada[] }
  | { type: "error"; id: number; error: string };

export function crearDetector(): DetectorArticulos {
  let worker: Worker | null = null;
  let carga: Promise<void> | null = null;
  let espera: Espera<void> | null = null;
  let cerrado = false;
  let siguiente = 0;
  const pendientes = new Map<number, Espera<CajaDetectada[]>>();

  const reiniciar = (error: Error) => {
    worker?.terminate();
    worker = null;
    carga = null;
    if (espera) {
      window.clearTimeout(espera.timer);
      espera.reject(error);
      espera = null;
    }
    for (const pendiente of pendientes.values()) {
      window.clearTimeout(pendiente.timer);
      pendiente.reject(error);
    }
    pendientes.clear();
  };

  const recibir = ({ data }: MessageEvent<Respuesta>) => {
    if (data?.type === "listo" && espera) {
      window.clearTimeout(espera.timer);
      espera.resolve();
      espera = null;
    } else if (data?.type === "error-carga") {
      reiniciar(new Error(data.error));
    } else if (data?.type === "resultado" || data?.type === "error") {
      const pendiente = pendientes.get(data.id);
      if (!pendiente) return;
      pendientes.delete(data.id);
      window.clearTimeout(pendiente.timer);
      if (data.type === "resultado") pendiente.resolve(data.cajas);
      else pendiente.reject(new Error(data.error));
    }
  };

  const precargar = () => {
    if (cerrado) return Promise.reject(new DOMException("Escaneo cancelado", "AbortError"));
    if (carga) return carga;
    const actual = new Worker(usarGpu() ? ARTICULOS_GPU_WORKER_URL : ARTICULOS_WORKER_URL, { type: "module", name: "articulos" });
    worker = actual;
    actual.onmessage = recibir;
    actual.onerror = () => reiniciar(new Error("No se pudo iniciar el reconocimiento. Conéctate e inténtalo de nuevo."));
    carga = new Promise<void>((resolve, reject) => {
      espera = {
        resolve, reject,
        timer: window.setTimeout(() => reiniciar(new Error("El reconocimiento tardó demasiado en cargar. Revisa tu conexión e inténtalo de nuevo.")), LOAD_TIMEOUT_MS),
      };
    });
    carga.catch(() => {});
    actual.postMessage({ type: "cargar", modelUrl: ARTICULOS_MODEL_URL });
    return carga;
  };

  const escanear = async (entrada: EntradaDetector): Promise<FotoDetectada> => {
    await precargar();
    const actual = worker;
    if (!actual) throw new Error("No pudimos iniciar el escaneo. Inténtalo de nuevo.");
    const id = ++siguiente;
    const cajas = await new Promise<CajaDetectada[]>((resolve, reject) => {
      const timer = window.setTimeout(() => reiniciar(new Error("El escaneo tardó demasiado. Inténtalo de nuevo.")), IMAGE_TIMEOUT_MS);
      pendientes.set(id, { resolve, reject, timer });
      try {
        actual.postMessage({ type: "escanear", id, modelUrl: ARTICULOS_MODEL_URL, image: entrada.image }, [entrada.image.data.buffer]);
      } catch {
        pendientes.delete(id);
        window.clearTimeout(timer);
        reject(new Error("No pudimos iniciar el escaneo. Inténtalo de nuevo."));
      }
    });
    return { counts: contarCajas(cajas), cajas: cajasEnFoto(cajas, entrada.marco) };
  };

  const cerrar = () => {
    cerrado = true;
    reiniciar(new DOMException("Escaneo cancelado", "AbortError"));
  };

  return { precargar, escanear, cerrar };
}
