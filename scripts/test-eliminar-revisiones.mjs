import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir(".playwright-mcp", { recursive: true });
const outfile = ".playwright-mcp/eliminar-revisiones-tests.cjs";
await build({
  entryPoints: ["scripts/eliminar-revisiones.test.ts"], outfile, bundle: true,
  platform: "node", format: "cjs", tsconfig: "tsconfig.json", packages: "external",
  plugins: [{ name: "isolated-delete-server", setup(build) {
    build.onResolve({ filter: /^next\/headers$/ }, () => ({ path: "request-headers", namespace: "test-headers" }));
    build.onLoad({ filter: /.*/, namespace: "test-headers" }, () => ({ contents: "export async function headers() { return globalThis.__deleteHeaders; }", loader: "js" }));
    build.onLoad({ filter: /src[\\/]lib[\\/]auth[\\/]session\.ts$/ }, () => ({ contents: "export async function getSesionUsuario() { return globalThis.__deleteSession; }", loader: "js" }));
    build.onLoad({ filter: /src[\\/]lib[\\/]supabase[\\/]server\.ts$/ }, () => ({ contents: "export function createAdminClient() { return globalThis.__deleteAdmin; } export async function createClient() { return globalThis.__deleteAuth; }", loader: "js" }));
  } }],
});
const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
