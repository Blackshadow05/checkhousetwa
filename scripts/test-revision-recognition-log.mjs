import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const output = resolve("outputs/revision-recognition-log/tests.cjs");
await mkdir(resolve("outputs/revision-recognition-log"), { recursive: true });
await build({
  entryPoints: [resolve("scripts/revision-recognition-log.test.ts")],
  absWorkingDir: process.cwd(), tsconfig: resolve("tsconfig.json"), outfile: output,
  bundle: true, platform: "node", format: "cjs", packages: "external",
  plugins: [{ name: "isolated-server-session", setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty-server-only" }));
    build.onLoad({ filter: /.*/, namespace: "empty-server-only" }, () => ({ contents: "", loader: "js" }));
    build.onResolve({ filter: /^(?:@\/lib\/auth\/session|\.\.\/src\/lib\/auth\/session)$/ }, () => ({ path: "session", namespace: "test-session" }));
    build.onLoad({ filter: /.*/, namespace: "test-session" }, () => ({ loader: "js", contents: `export async function createPrivateClient(){return globalThis.__recognitionTestClient};export async function createPrivateSession(){return {client:globalThis.__recognitionTestClient,usuario:{id:1,nombre:'Prueba local'}}};export async function getSesionUsuario(){return {id:1,nombre:'Prueba local'}};` }));
  } }],
});
const result = spawnSync(process.execPath, ["--test", output], { stdio: "inherit", env: process.env, windowsHide: true });
process.exitCode = result.status ?? 1;
