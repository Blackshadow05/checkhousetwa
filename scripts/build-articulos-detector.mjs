import { build } from "esbuild";
import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const output = resolve("public/articulos");
const wasm = require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm");
const gpuWasm = require.resolve("onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm");
const ortRoot = resolve(dirname(wasm), "..");
const { version } = JSON.parse(await readFile(resolve(ortRoot, "package.json"), "utf8"));
const wasmName = `ort-${version}.wasm`;
const gpuWasmName = `ort-gpu-${version}.wasm`;

await mkdir(output, { recursive: true });
for (const name of await readdir(output)) {
  if (/^ort-.*\.wasm$/.test(name) && name !== wasmName && name !== gpuWasmName) await rm(resolve(output, name));
}
await copyFile(wasm, resolve(output, wasmName));
await copyFile(gpuWasm, resolve(output, gpuWasmName));
await copyFile(resolve("models/articulos-v7.onnx"), resolve(output, "articulos-v7.onnx"));

const common = {
  entryPoints: ["src/workers/articulos-detector.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  logLevel: "warning",
};
await build({
  ...common,
  outfile: resolve(output, "articulos-worker.js"),
  define: { __ORT_WASM_URL__: JSON.stringify(`/articulos/${wasmName}`), __USE_WEBGPU__: "false" },
});
await build({
  ...common,
  outfile: resolve(output, "articulos-worker-gpu.js"),
  alias: { "onnxruntime-web/wasm": "onnxruntime-web/webgpu" },
  define: { __ORT_WASM_URL__: JSON.stringify(`/articulos/${gpuWasmName}`), __USE_WEBGPU__: "true" },
});
