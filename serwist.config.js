import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // The large engine is cached on first use, instead of downloading for every user.
  globIgnores: ["**/opencv/opencv-4.12.0.js", "**/articulos/*.onnx", "**/articulos/*.wasm"],
  // Next's static /~offline output is already discovered and revisioned by
  // Serwist. Adding it again with a different revision prevents SW startup.
});
