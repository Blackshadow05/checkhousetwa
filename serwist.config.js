import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Next's static /~offline output is already discovered and revisioned by
  // Serwist. Adding it again with a different revision prevents SW startup.
});
