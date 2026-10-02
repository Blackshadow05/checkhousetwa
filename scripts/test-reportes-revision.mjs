import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

await mkdir(".playwright-mcp", { recursive: true });
await build({
  entryPoints: [resolve("scripts/reportes-revision.test.ts")],
  absWorkingDir: process.cwd(),
  tsconfig: resolve("tsconfig.json"),
  outfile: ".playwright-mcp/reportes-revision-tests.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "server-only-in-tests",
    setup(build) {
      build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty-server-only" }));
      build.onLoad({ filter: /.*/, namespace: "empty-server-only" }, () => ({ contents: "", loader: "js" }));
    },
  }],
});
const result = spawnSync(process.execPath, ["--test", ".playwright-mcp/reportes-revision-tests.cjs"], { stdio: "inherit", env: process.env });
process.exitCode = result.status ?? 1;
