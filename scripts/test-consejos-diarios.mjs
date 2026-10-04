import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

await mkdir(".playwright-mcp", { recursive: true });
await build({
  entryPoints: [resolve("scripts/consejos-diarios.test.ts")],
  absWorkingDir: process.cwd(),
  tsconfig: resolve("tsconfig.json"),
  outfile: ".playwright-mcp/consejos-diarios-tests.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
const result = spawnSync(process.execPath, ["--test", ".playwright-mcp/consejos-diarios-tests.cjs"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
