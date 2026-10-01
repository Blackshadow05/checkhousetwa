import {
  ARTICULOS_CLASES,
  ARTICULOS_INPUT_SIZE,
  ARTICULOS_MODEL_URL,
  ARTICULOS_PAD_VALUE,
  ARTICULOS_GPU_WORKER_URL,
  ARTICULOS_WORKER_URL,
  sumarConteos,
  type CajaDetectada,
  type ConteoArticulos,
} from "@/lib/articulos-model";
import type { RevisionScanBox } from "@/lib/revision-form";

const LOAD_TIMEOUT_MS = 180_000;

function usarGpu() {
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return apple && "gpu" in navigator;
}
const IMAGE_TIMEOUT_MS = 60_000;

type Marco = { x: number; y: number; width: number; height: number };

async function letterbox(blob: Blob): Promise<{ image: ImageData; marco: Marco }> {
  const source = URL.createObjectURL(blob);
  const canvas = document.createElement("canvas");
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const size = ARTICULOS_INPUT_SIZE;
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const x = Math.floor((size - width) / 2);
    const y = Math.floor((size - height) / 2);
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas");
    context.fillStyle = `rgb(${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE})`;
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, x, y, width, height);
    return { image: context.getImageData(0, 0, size, size), marco: { x, y, width, height } };
  } catch {
    throw new Error("No pudimos leer una de las fotos. Quítala y elige otra.");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
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

export async function detectarArticulos(blobs: Blob[], options: {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
} = {}): Promise<{ conteo: ConteoArticulos; cajas: RevisionScanBox[][] }> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (!blobs.length) throw new Error("Añade al menos una foto para escanear.");
  onProgress?.("Preparando fotos…");
  const images: ImageData[] = [];
  const marcos: Marco[] = [];
  for (const blob of blobs) {
    const { image, marco } = await letterbox(blob);
    images.push(image);
    marcos.push(marco);
    signal?.throwIfAborted();
  }
  onProgress?.("Cargando el reconocimiento…");
  return new Promise((resolve, reject) => {
    const worker = new Worker(usarGpu() ? ARTICULOS_GPU_WORKER_URL : ARTICULOS_WORKER_URL, { type: "module", name: "articulos" });
    let timer = 0;
    const arm = (ms: number, message: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(new Error(message)), ms);
    };
    const finish = (error?: Error, counts?: number[][], boxes?: CajaDetectada[][]) => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve({
        conteo: sumarConteos(counts ?? []),
        cajas: marcos.map((marco, index) => cajasEnFoto(boxes?.[index] ?? [], marco)),
      });
    };
    const abort = () => finish(new DOMException("Escaneo cancelado", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    arm(LOAD_TIMEOUT_MS, "El reconocimiento tardó demasiado en cargar. Revisa tu conexión e inténtalo de nuevo.");
    worker.onerror = () => finish(new Error("No se pudo iniciar el reconocimiento. Conéctate e inténtalo de nuevo."));
    worker.onmessage = ({ data }: MessageEvent<{ ready?: boolean; progress?: number; counts?: number[][]; boxes?: CajaDetectada[][]; error?: string }>) => {
      if (data.error) return finish(new Error(data.error));
      if (!data.ready && data.progress === undefined && !data.counts) return;
      if (data.counts) return finish(undefined, data.counts, data.boxes);
      const done = data.ready ? 0 : data.progress ?? 0;
      if (done < images.length) onProgress?.(`Escaneando foto ${done + 1} de ${images.length}…`);
      arm(IMAGE_TIMEOUT_MS, "El escaneo tardó demasiado. Inténtalo de nuevo o completa los artículos manualmente.");
    };
    try {
      worker.postMessage({ modelUrl: ARTICULOS_MODEL_URL, images }, images.map((image) => image.data.buffer));
    } catch {
      finish(new Error("No pudimos iniciar el escaneo. Inténtalo de nuevo."));
    }
  });
}
