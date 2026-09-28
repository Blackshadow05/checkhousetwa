import { build } from "esbuild";
import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const output = resolve("public/opencv");
const runtime = require.resolve("@techstark/opencv-js");
await mkdir(output, { recursive: true });
await copyFile(runtime, resolve(output, "opencv-4.12.0.js"));
await copyFile(resolve(dirname(runtime), "../LICENSE"), resolve(output, "LICENSE.txt"));
await build({
  entryPoints: ["src/workers/pantalla-analyzer.ts"],
  outfile: resolve(output, "pantalla-worker.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
});
