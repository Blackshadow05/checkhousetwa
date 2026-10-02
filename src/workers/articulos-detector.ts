import * as ort from "onnxruntime-web/wasm";
import { detectarCajas } from "../lib/articulos-model";

declare const self: DedicatedWorkerGlobalScope;
declare const __ORT_WASM_URL__: string;
declare const __USE_WEBGPU__: boolean;

type Mensaje =
  | { type: "cargar"; modelUrl: string }
  | { type: "escanear"; id: number; modelUrl: string; image: ImageData };
type Motor = "gpu" | "cpu";
type Sesion = { model: ort.InferenceSession; motor: Motor };

let session: Promise<Sesion> | null = null;
let cola: Promise<void> = Promise.resolve();

async function modelBytes(modelUrl: string) {
  const url = new URL(modelUrl, self.location.origin).href;
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

async function createSession(modelUrl: string): Promise<Sesion> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { wasm: new URL(__ORT_WASM_URL__, self.location.origin).href };
  const bytes = await modelBytes(modelUrl);
  if (__USE_WEBGPU__) {
    if (!("gpu" in self.navigator)) self.postMessage({ fallback: "WebGPU no disponible en el worker" });
    else {
      try {
        const model = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
        return { model, motor: "gpu" };
      } catch (error) {
        self.postMessage({ fallback: `GPU falló: ${error instanceof Error ? error.message.slice(0, 120) : "desconocido"}` });
      }
    }
  }
  const model = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  return { model, motor: "cpu" };
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
    const boxes = detectarCajas(data, tensor.dims);
    tensor.dispose();
    return boxes;
  } finally {
    input.dispose();
  }
}

async function scan(modelUrl: string, image: ImageData) {
  const loaded = await loadSession(modelUrl);
  try {
    return await runImage(loaded.model, image);
  } catch (error) {
    if (loaded.motor !== "gpu") throw error;
    self.postMessage({ fallback: `GPU falló al escanear: ${error instanceof Error ? error.message.slice(0, 120) : "desconocido"}` });
    const model = await ort.InferenceSession.create(await modelBytes(modelUrl), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    session = Promise.resolve({ model, motor: "cpu" });
    self.postMessage({ motor: "cpu" });
    return await runImage(model, image);
  }
}

self.onmessage = ({ data }: MessageEvent<Mensaje>) => {
  if (data.type === "cargar") {
    loadSession(data.modelUrl).then(
      (loaded) => self.postMessage({ type: "listo", motor: loaded.motor }),
      () => self.postMessage({ type: "error-carga", error: "No pudimos cargar el reconocimiento. Conéctate e inténtalo de nuevo." }),
    );
    return;
  }
  const { id, modelUrl, image } = data;
  cola = cola.then(async () => {
    try {
      self.postMessage({ type: "resultado", id, cajas: await scan(modelUrl, image) });
    } catch {
      self.postMessage({ type: "error", id, error: "No pudimos reconocer los artículos de esta foto." });
    }
  });
};
