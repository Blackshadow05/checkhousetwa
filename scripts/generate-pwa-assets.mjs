import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "public/icons");
const splash = path.join(root, "public/splash");
await mkdir(icons, { recursive: true });
await mkdir(splash, { recursive: true });

// Keep the entire house within the central 80% maskable safe zone.
const mark =
  '<path d="M160 248 256 166 352 248v106a20 20 0 0 1-20 20H180a20 20 0 0 1-20-20Z"/><path d="M224 374V266h64v108"/>';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#285542"/><g fill="none" stroke="#f6f7f4" stroke-width="17" stroke-linecap="round" stroke-linejoin="round">${mark}</g></svg>`;
await writeFile(path.join(icons, "casitas.svg"), svg);
for (const size of [192, 512]) {
  const buffer = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(path.join(icons, `icon-${size}.png`), buffer);
  await writeFile(path.join(icons, `icon-maskable-${size}.png`), buffer);
}
await sharp(Buffer.from(svg))
  .resize(180, 180)
  .png()
  .toFile(path.join(icons, "apple-touch-icon.png"));
await sharp(Buffer.from(svg))
  .resize(180, 180)
  .png()
  .toFile(path.join(root, "src/app/apple-icon.png"));
await sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile(path.join(root, "src/app/icon.png"));
await sharp(Buffer.from(svg))
  .resize(32, 32)
  .png()
  .toFile(path.join(root, "public/favicon.png"));
const faviconPng = await sharp(Buffer.from(svg))
  .resize(32, 32)
  .png()
  .toBuffer();
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 32;
icoHeader[7] = 32;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(faviconPng.length, 14);
icoHeader.writeUInt32LE(22, 18);
await writeFile(
  path.join(root, "src/app/favicon.ico"),
  Buffer.concat([icoHeader, faviconPng]),
);

const sizes = [
  [320, 568, 2],
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 736, 3],
  [414, 896, 2],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
];
for (const [width, height, ratio] of sizes) {
  for (const orientation of ["portrait", "landscape"]) {
    const w = (orientation === "portrait" ? width : height) * ratio;
    const h = (orientation === "portrait" ? height : width) * ratio;
    const iconSize = 88 * ratio;
    const badge = await sharp(Buffer.from(svg))
      .resize(iconSize, iconSize)
      .png()
      .toBuffer();
    await sharp({
      create: { width: w, height: h, channels: 3, background: "#f6f7f4" },
    })
      .composite([
        {
          input: badge,
          left: Math.round((w - iconSize) / 2),
          top: Math.round((h - iconSize) / 2),
        },
      ])
      .png()
      .toFile(
        path.join(splash, `${width}x${height}-${ratio}-${orientation}.png`),
      );
  }
}
console.log("Generated Casitas icons and iPhone startup images.");
