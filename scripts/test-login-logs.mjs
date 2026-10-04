import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir(".playwright-mcp", { recursive: true });
const outfile = ".playwright-mcp/login-logs-tests.cjs";
await build({
  entryPoints: ["scripts/login-logs.test.ts"], outfile, bundle: true,
  platform: "node", format: "cjs", tsconfig: "tsconfig.json", packages: "external",
  plugins: [{ name: "isolated-login-logs-server", setup(build) {
    build.onLoad({ filter: /src[\\/]lib[\\/]auth[\\/]session\.ts$/ }, () => ({
      contents: "export async function getSesionUsuario() { return globalThis.__loginLogsSession; }", loader: "js",
    }));
    build.onLoad({ filter: /src[\\/]lib[\\/]supabase[\\/]server\.ts$/ }, () => ({
      contents: "export function createAdminClient() { return globalThis.__loginLogsClient(); }", loader: "js",
    }));
  } }],
});
const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
