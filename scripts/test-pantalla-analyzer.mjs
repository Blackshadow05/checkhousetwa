import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir(".playwright-mcp", { recursive: true });
await build({ entryPoints: ["test/pantalla-analysis.test.ts"], outfile: ".playwright-mcp/pantalla-tests.cjs", bundle: true, platform: "node", format: "cjs", packages: "external" });
const result = spawnSync(process.execPath, ["--test", ".playwright-mcp/pantalla-tests.cjs"], { stdio: "inherit", env: process.env });
process.exitCode = result.status ?? 1;
