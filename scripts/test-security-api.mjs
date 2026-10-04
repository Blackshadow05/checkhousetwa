import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const outfile = resolve(".playwright-mcp/security-api-tests.cjs");
await build({
  entryPoints: ["scripts/security-api.test.ts"], outfile, bundle: true,
  platform: "node", format: "cjs", tsconfig: "tsconfig.json",
  plugins: [{ name: "mock-auth-session", setup(build) {
    build.onLoad({ filter: /src[\\/]lib[\\/]auth[\\/]session\.ts$/ }, () => ({
      contents: "export async function getSesionUsuario() { return globalThis.__securitySession ?? null; }",
      loader: "js",
    }));
  } }],
});
const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
process.exit(result.status ?? 1);
