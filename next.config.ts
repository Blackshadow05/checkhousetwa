import type { NextConfig } from "next";

const cloudinaryCloudName =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
  process.env.VITE_CLOUDINARY_CLOUD_NAME ||
  "dhd61lan4";
const cloudinaryUploadPreset =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ||
  process.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
  "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: cloudinaryUploadPreset,
  },
  reactStrictMode: true,
  // Next 16 blocks /_next scripts from phones on the LAN unless the IP is listed.
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
    "*.trycloudflare.com",
  ],
  // Next's build uses the TS6 compatibility API; `pnpm tsc` still uses TS7.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
