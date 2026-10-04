import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icons = path.join(root, "public/icons");
const splash = path.join(root, "public/splash");
const fullBleed = path.join(root, "assets/icono/icono-1024.png");
const mark = path.join(root, "assets/icono/marca.png");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
await mkdir(icons, { recursive: true });
await mkdir(splash, { recursive: true });

const square = (size) =>
  sharp(fullBleed).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 });

const markIn = (size, scale) => {
  const inner = Math.round(size * scale);
  const pad = Math.floor((size - inner) / 2);
  return sharp(mark)
    .resize(inner, inner, { fit: "contain", background: transparent, kernel: "lanczos3" })
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: transparent })
    .png({ compressionLevel: 9 });
};

const markOn = async (size, scale, background) =>
  sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: await markIn(size, scale).toBuffer() }])
    .png({ compressionLevel: 9 });

for (const size of [192, 512]) {
  await markIn(size, 0.8).toFile(path.join(icons, `icon-${size}.png`));
  await (await markOn(size, 0.56, "#ffffff")).toFile(path.join(icons, `icon-maskable-${size}.png`));
}
await square(180).toFile(path.join(icons, "apple-touch-icon.png"));
await square(180).toFile(path.join(root, "src/app/apple-icon.png"));
await markIn(512, 0.8).toFile(path.join(root, "src/app/icon.png"));
await markIn(32, 0.94).toFile(path.join(root, "public/favicon.png"));
const splashMark = await markIn(768, 0.8).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toBuffer();
await writeFile(
  path.join(root, "src/app/splash-mark.css"),
  `.app-splash-mark {
  background-image: url("data:image/webp;base64,${splashMark.toString("base64")}");
}
`,
);

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map((size) => markIn(size, 0.94).toBuffer()));
const icoHeader = Buffer.alloc(6 + 16 * icoSizes.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);
let offset = icoHeader.length;
icoSizes.forEach((size, index) => {
  const entry = 6 + 16 * index;
  icoHeader[entry] = size;
  icoHeader[entry + 1] = size;
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(icoImages[index].length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += icoImages[index].length;
});
await writeFile(path.join(root, "src/app/favicon.ico"), Buffer.concat([icoHeader, ...icoImages]));

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
    const iconSize = 96 * ratio;
    const badge = await markIn(iconSize, 1).toBuffer();
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
      .png({ compressionLevel: 9 })
      .toFile(path.join(splash, `${width}x${height}-${ratio}-${orientation}.png`));
  }
}
console.log("Generated Casitas icons and iPhone startup images.");
