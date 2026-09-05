import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 blocks /_next scripts from phones on the LAN unless the IP is listed.
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
  ],
  // Next's build uses the TS6 compatibility API; `pnpm tsc` still uses TS7.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
