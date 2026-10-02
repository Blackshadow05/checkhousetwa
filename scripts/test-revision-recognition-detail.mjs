import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const directory = resolve("outputs/revision-recognition-detail");
await mkdir(directory, { recursive: true });
const output = resolve(directory, "tests.cjs");
await build({
  entryPoints: [resolve("scripts/revision-recognition-detail.test.ts")],
  absWorkingDir: process.cwd(), tsconfig: resolve("tsconfig.json"), outfile: output,
  bundle: true, platform: "node", format: "cjs", packages: "external",
});
const result = spawnSync(process.execPath, ["--test", output], { stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
