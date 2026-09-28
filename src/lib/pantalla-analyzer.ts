import type { PantallaDetection } from "./pantalla-detection";

/** OpenCV runs off the UI thread and never uploads the image. */
export async function analyzePantalla(blob: Blob, signal?: AbortSignal): Promise<PantallaDetection> {
  const source = URL.createObjectURL(blob);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = source;
    await image.decode();
    signal?.throwIfAborted();
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No pudimos leer la foto. Puedes clasificarla manualmente.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return await new Promise<PantallaDetection>((resolve, reject) => {
      const worker = new Worker("/opencv/pantalla-worker.js");
      const finish = (error?: Error, result?: PantallaDetection) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        if (error) reject(error); else resolve(result!);
      };
      const abort = () => finish(new DOMException("Análisis cancelado", "AbortError"));
      const timer = setTimeout(() => finish(new Error("El análisis tardó demasiado. Puedes indicar los puntos manualmente.")), 45_000);
      signal?.addEventListener("abort", abort, { once: true });
      worker.onerror = () => finish(new Error("No se pudo cargar el análisis. Conéctate e inténtalo de nuevo o clasifica la foto manualmente."));
      worker.onmessage = ({ data }: MessageEvent<{ result?: PantallaDetection; error?: string }>) => {
        if (data.result) finish(undefined, data.result);
        else finish(new Error(data.error || "No pudimos analizar esta foto."));
      };
      try { worker.postMessage(pixels, [pixels.data.buffer]); }
      catch { finish(new Error("No pudimos iniciar el análisis. Puedes clasificar la foto manualmente.")); }
    });
  } finally {
    URL.revokeObjectURL(source);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
