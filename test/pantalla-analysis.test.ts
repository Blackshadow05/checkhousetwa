import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";
import type * as OpenCV from "@techstark/opencv-js";
import { detectPantallaPoints, type PantallaDetection } from "../src/lib/pantalla-detection";
import { actualizarNotasPantallas, estadoPorPuntos, notasDePantallas, validarPantalla, type PantallaInput } from "../src/lib/pantallas";
import { savePantalla } from "../src/lib/save-pantalla";

const require = createRequire(`${process.cwd()}/package.json`);
let cv: typeof OpenCV;
before(async () => {
  const runtime = require("@techstark/opencv-js");
  cv = runtime instanceof Promise ? await runtime : runtime;
  if (!cv.Mat) await new Promise<void>(resolve => { cv.onRuntimeInitialized = resolve; });
});

function screenImage(count: number, bright = false): ImageData {
  const width = 800; const height = 600;
  const data = new Uint8ClampedArray(width * height * 4);
  const centers = Array.from({ length: count }, (_, i) => ({ x: 150 + i % 5 * 120, y: 170 + Math.floor(i / 5) * 120 }));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = x > 60 && x < 740 && y > 100 && y < 490 ? 30 : 180;
    for (const c of centers) value += (bright ? 210 : 95) * Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / 72);
    const offset = (y * width + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data } as ImageData;
}

const seguros = (result: PantallaDetection) => result.points.filter(point => point.confidence === "seguro");

function roomWithoutScreen(): ImageData {
  const width = 800; const height = 600;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const grain = y > 430 ? 8 * Math.sin(x / 9 + y / 40) : 0;
    const shade = y * 0.03 + ((x * 7 + y * 13) % 5);
    data[offset] = y > 430 ? 96 + grain : 228 - shade;
    data[offset + 1] = y > 430 ? 64 + grain : 216 - shade;
    data[offset + 2] = y > 430 ? 42 + grain : 192 - shade;
    data[offset + 3] = 255;
  }
  return { width, height, data } as ImageData;
}

for (const count of [0, 1, 5, 8, 9, 15]) test(`OpenCV detects ${count} diffuse white spots on a screen`, () => {
  const result = detectPantallaPoints(cv, screenImage(count));
  assert.equal(result.screenFound, true);
  assert.equal(result.noScreen, false);
  assert.equal(result.points.length, count);
  assert.equal(seguros(result).length, count);
});

test("bright white defects are retained", () => {
  assert.equal(seguros(detectPantallaPoints(cv, screenImage(3, true))).length, 3);
});

test("a uniform close-up without a visible frame stays uncertain instead of healthy or missing", () => {
  const image = screenImage(0);
  image.data.fill(100);
  const result = detectPantallaPoints(cv, image);
  assert.equal(result.screenFound, false);
  assert.equal(result.noScreen, false);
});

test("a wall and furniture without a television is reported as no screen", () => {
  const result = detectPantallaPoints(cv, roomWithoutScreen());
  assert.equal(result.screenFound, false);
  assert.equal(result.noScreen, true);
  assert.equal(result.points.length, 0);
});

const references = [
  { env: "PANTALLA_TEST_IMAGE", name: "the reference with an on-screen menu", locations: [[0.655, 0.274], [0.655, 0.367], [0.656, 0.47], [0.655, 0.571], [0.658, 0.658]] },
  { env: "PANTALLA_REFLECTION_TEST_IMAGE", name: "the reference with room reflections", locations: [[0.663, 0.359], [0.659, 0.445], [0.658, 0.54], [0.737, 0.358], [0.734, 0.446], [0.732, 0.542], [0.73, 0.636], [0.73, 0.72]] },
  { env: "PANTALLA_ANGLED_TEST_IMAGE", name: "an angled photo with the stand in view", locations: [[0.269, 0.372], [0.257, 0.478], [0.246, 0.579]] },
  { env: "PANTALLA_BOOT_LOGO_TEST_IMAGE", name: "a lit screen with the boot logo", locations: [[0.665, 0.365], [0.741, 0.565], [0.337, 0.649], [0.418, 0.65], [0.502, 0.651], [0.585, 0.652], [0.665, 0.655]] },
  { env: "PANTALLA_CLIPPED_TEST_IMAGE", name: "a frame cut by the photo edge", locations: [[0.716, 0.348], [0.623, 0.351], [0.723, 0.459], [0.627, 0.461], [0.631, 0.576], [0.731, 0.577], [0.636, 0.689]] },
];
for (const reference of references) test(`${reference.name} counts only its real white dots`, { skip: !process.env[reference.env] }, async () => {
  const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));
  for (const variant of ["original", "jpeg", "webp", "rotated"]) {
    let source = sharp(process.env[reference.env]).rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true });
    if (variant === "jpeg") source = sharp(await source.jpeg({ quality: 75 }).toBuffer());
    if (variant === "webp") source = sharp(await source.webp({ quality: 70 }).toBuffer());
    if (variant === "rotated") source = source.rotate(90);
    const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = detectPantallaPoints(cv, { width: info.width, height: info.height, data: new Uint8ClampedArray(data) } as ImageData);
    assert.equal(result.screenFound, true, variant);
    const confirmed = seguros(result);
    for (const [x, y] of reference.locations) {
      const expected = variant === "rotated" ? { x: 1 - y, y: x } : { x, y };
      assert.ok(confirmed.some(p => Math.hypot(p.x - expected.x, p.y - expected.y) < 0.02), `${variant}: missing ${x},${y}`);
    }
    assert.equal(confirmed.length, reference.locations.length, variant);
    assert.ok(result.points.length - confirmed.length <= 3, `${variant}: ${result.points.length - confirmed.length} doubtful`);
  }
});

test("classification boundaries include 8 as moderate and 9 as severe", () => {
  assert.deepEqual([0, 1, 8, 9].map(estadoPorPuntos), ["en buen estado", "moderada", "moderada", "grave"]);
});

const king = { ubicacion: "Cuarto King", estado: "moderada", puntos: 5 };
const living = { ubicacion: "Living", estado: "moderada", puntos: 3 };
test("notes include only damaged screens and respect manual state overrides", () => {
  assert.equal(notasDePantallas([king, living]), "Pantalla Cuarto King tiene 5 puntos. Pantalla Living tiene 3 puntos");
  assert.equal(notasDePantallas([{ ...king, estado: "en buen estado" }, { ...living, estado: "no hay pantalla" }]), "");
  assert.equal(notasDePantallas([{ ...king, puntos: 1 }]), "Pantalla Cuarto King tiene 1 punto");
  assert.match(notasDePantallas([{ ...king, puntos: null, estado: "defectuosa" }]), /tiene daño/);
});

test("notes follow edits, removal and room changes without erasing additional text", () => {
  const initial = actualizarNotasPantallas("Revisar el control.", [], [king]);
  const both = actualizarNotasPantallas(initial, [king], [king, living]);
  assert.equal(both, `${notasDePantallas([king, living])}\nRevisar el control.`);
  const corrected = { ...king, ubicacion: "Cuarto Queen", puntos: 9, estado: "grave" };
  const edited = actualizarNotasPantallas(both, [king, living], [corrected]);
  assert.equal(edited, "Pantalla Cuarto Queen tiene 9 puntos\nRevisar el control.");
  assert.equal(actualizarNotasPantallas(edited, [corrected], [{ ...corrected, estado: "en buen estado" }]), "Revisar el control.");
  assert.equal(actualizarNotasPantallas("Resumen reescrito a mano", [king], [living]), "Resumen reescrito a mano");
});

const report: PantallaInput = { tipo: "reporte", numero_casita: 1, fotos: [{ ...king, url: "https://example.test/foto.jpg" }], notas: notasDePantallas([king]), origen_ubicacion: null, origen_habitacion: null, destino_ubicacion: null, destino_habitacion: null };
test("validation accepts new and legacy states; rejects invalid point counts and duplicate rooms", () => {
  for (const estado of ["moderada", "grave", "defectuosa", "en buen estado", "no hay pantalla"]) assert.equal(validarPantalla({ ...report, fotos: [{ ...report.fotos[0], estado }] }), null);
  for (const puntos of [-1, 1.5, NaN, Infinity, 1000]) assert.ok(validarPantalla({ ...report, fotos: [{ ...report.fotos[0], puntos }] }));
  assert.ok(validarPantalla({ ...report, fotos: [report.fotos[0], report.fotos[0]] }));
});

test("the save payload preserves point counts and manually selected states", async () => {
  let inserted: PantallaInput | undefined;
  const client = { from: () => ({ insert: async (value: PantallaInput) => { inserted = value; return { error: null }; } }), rpc: async () => ({ error: null }) };
  const input = { ...report, fotos: [{ ...report.fotos[0], estado: "grave" }] };
  const result = await savePantalla(client as unknown as Parameters<typeof savePantalla>[0], input, "Prueba local", "2026-09-20 12:00:00");
  assert.equal(result.saved, true);
  assert.deepEqual(inserted?.fotos, input.fotos);
  assert.equal(inserted?.notas, input.notas);
});
