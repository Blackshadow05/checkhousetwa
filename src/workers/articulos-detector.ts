import * as ort from "onnxruntime-web/wasm";
import { contarDetecciones } from "../lib/articulos-model";

declare const self: DedicatedWorkerGlobalScope;
declare const __ORT_WASM_URL__: string;
declare const __USE_WEBGPU__: boolean;

type DetectRequest = { modelUrl: string; images: ImageData[] };
type Motor = "gpu" | "cpu";

let session: Promise<{ model: ort.InferenceSession; motor: Motor }> | null = null;

async function createSession(modelUrl: string) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { wasm: new URL(__ORT_WASM_URL__, self.location.origin).href };
  const url = new URL(modelUrl, self.location.origin).href;
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  if (__USE_WEBGPU__) {
    if (!("gpu" in self.navigator)) self.postMessage({ fallback: "WebGPU no disponible en el worker" });
    else {
      try {
        const model = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
        return { model, motor: "gpu" as Motor };
      } catch (error) {
        self.postMessage({ fallback: `GPU falló: ${error instanceof Error ? error.message.slice(0, 120) : "desconocido"}` });
      }
    }
  }
  const model = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  return { model, motor: "cpu" as Motor };
}

function loadSession(modelUrl: string) {
  if (!session) {
    session = createSession(modelUrl);
    session.catch(() => { session = null; });
  }
  return session;
}

function toTensor(image: ImageData) {
  const size = image.width * image.height;
  const pixels = image.data;
  const data = new Float32Array(size * 3);
  for (let index = 0; index < size; index++) {
    const offset = index * 4;
    data[index] = pixels[offset] / 255;
    data[index + size] = pixels[offset + 1] / 255;
    data[index + size * 2] = pixels[offset + 2] / 255;
  }
  return new ort.Tensor("float32", data, [1, 3, image.height, image.width]);
}

async function runImage(model: ort.InferenceSession, image: ImageData) {
  const input = toTensor(image);
  try {
    const output = await model.run({ [model.inputNames[0]]: input });
    const tensor = output[model.outputNames[0]];
    const data = tensor.location === "cpu" ? tensor.data as Float32Array : await tensor.getData() as Float32Array;
    const counts = contarDetecciones(data, tensor.dims);
    tensor.dispose();
    return counts;
  } finally {
    input.dispose();
  }
}

self.onmessage = async ({ data }: MessageEvent<DetectRequest>) => {
  let loaded: { model: ort.InferenceSession; motor: Motor };
  try {
    loaded = await loadSession(data.modelUrl);
    self.postMessage({ ready: true, motor: loaded.motor });
  } catch {
    self.postMessage({ error: "No pudimos cargar el modelo de reconocimiento. Conéctate e inténtalo de nuevo." });
    return;
  }
  try {
    const counts: number[][] = [];
    for (const [index, image] of data.images.entries()) {
      try {
        counts.push(await runImage(loaded.model, image));
      } catch (error) {
        if (loaded.motor !== "gpu") throw error;
        self.postMessage({ fallback: `GPU falló al escanear: ${error instanceof Error ? error.message.slice(0, 120) : "desconocido"}` });
        const bytes = new Uint8Array(await (await fetch(new URL(data.modelUrl, self.location.origin).href)).arrayBuffer());
        loaded = { model: await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }), motor: "cpu" };
        session = Promise.resolve(loaded);
        self.postMessage({ motor: "cpu" });
        counts.push(await runImage(loaded.model, image));
      }
      self.postMessage({ progress: index + 1 });
    }
    self.postMessage({ counts });
  } catch {
    self.postMessage({ error: "No pudimos reconocer los artículos de estas fotos. Puedes completarlos manualmente." });
  }
};
