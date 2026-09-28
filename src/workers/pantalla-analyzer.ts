import type * as OpenCV from "@techstark/opencv-js";
import { detectPantallaPoints } from "../lib/pantalla-detection";

declare const self: DedicatedWorkerGlobalScope & { cv: Promise<typeof OpenCV> | typeof OpenCV };

self.onmessage = async ({ data }: MessageEvent<ImageData>) => {
  try {
    self.importScripts("/opencv/opencv-4.12.0.js");
    // This pinned Emscripten build is a self-resolving thenable, not a Promise.
    // Awaiting it unconditionally would loop forever during initialization.
    const cv = self.cv instanceof Promise ? await self.cv : self.cv;
    if (!cv.Mat) await new Promise<void>((resolve, reject) => {
      cv.onRuntimeInitialized = () => resolve();
      (cv as typeof cv & { onAbort?: (reason: string) => void }).onAbort = reason => reject(new Error(reason));
    });
    self.postMessage({ result: detectPantallaPoints(cv, data) });
  } catch {
    self.postMessage({ error: "No pudimos analizar esta foto. Puedes indicar los puntos y el estado manualmente." });
  }
};
