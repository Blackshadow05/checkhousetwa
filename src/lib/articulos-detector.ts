import {
  ARTICULOS_INPUT_SIZE,
  ARTICULOS_MODEL_URL,
  ARTICULOS_PAD_VALUE,
  ARTICULOS_GPU_WORKER_URL,
  ARTICULOS_WORKER_URL,
  sumarConteos,
  type ConteoArticulos,
} from "@/lib/articulos-model";

const LOAD_TIMEOUT_MS = 180_000;

function usarGpu() {
  const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return apple && "gpu" in navigator;
}
const IMAGE_TIMEOUT_MS = 60_000;

async function letterbox(blob: Blob): Promise<ImageData> {
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
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas");
    context.fillStyle = `rgb(${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE}, ${ARTICULOS_PAD_VALUE})`;
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
    return context.getImageData(0, 0, size, size);
  } catch {
    throw new Error("No pudimos leer una de las fotos. Quítala y elige otra.");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(source);
  }
}

export async function detectarArticulos(blobs: Blob[], options: {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
} = {}): Promise<ConteoArticulos> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (!blobs.length) throw new Error("Añade al menos una foto para escanear.");
  onProgress?.("Preparando fotos…");
  const images: ImageData[] = [];
  for (const blob of blobs) {
    images.push(await letterbox(blob));
    signal?.throwIfAborted();
  }
  onProgress?.("Cargando el reconocimiento…");
  return new Promise<ConteoArticulos>((resolve, reject) => {
    const worker = new Worker(usarGpu() ? ARTICULOS_GPU_WORKER_URL : ARTICULOS_WORKER_URL, { type: "module", name: "articulos" });
    let timer = 0;
    const arm = (ms: number, message: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finish(new Error(message)), ms);
    };
    const finish = (error?: Error, counts?: number[][]) => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(sumarConteos(counts ?? []));
    };
    const abort = () => finish(new DOMException("Escaneo cancelado", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    arm(LOAD_TIMEOUT_MS, "El reconocimiento tardó demasiado en cargar. Revisa tu conexión e inténtalo de nuevo.");
    worker.onerror = () => finish(new Error("No se pudo iniciar el reconocimiento. Conéctate e inténtalo de nuevo."));
    worker.onmessage = ({ data }: MessageEvent<{ ready?: boolean; progress?: number; counts?: number[][]; error?: string }>) => {
      if (data.error) return finish(new Error(data.error));
      if (!data.ready && data.progress === undefined && !data.counts) return;
      if (data.counts) return finish(undefined, data.counts);
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
