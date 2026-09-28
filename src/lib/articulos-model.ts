import type { InventoryKey } from "@/lib/revision-form";

export const ARTICULOS_INPUT_SIZE = 640;
export const ARTICULOS_PAD_VALUE = 114;
export const ARTICULOS_MODEL_URL = "/articulos/articulos-v7.onnx";
export const ARTICULOS_WORKER_URL = "/articulos/articulos-worker.js";
export const ARTICULOS_GPU_WORKER_URL = "/articulos/articulos-worker-gpu.js";

export const ARTICULOS_CLASES = [
  "accesorios_secadora",
  "binoculares",
  "bulto",
  "chromecast",
  "cola_caballo",
  "controles_tv",
  "plancha_cabello",
  "secadora",
  "sombrero",
  "speaker",
  "steamer",
  "bolsa_vapor",
  "trapo_binoculares",
  "bolso_yute",
] as const satisfies readonly InventoryKey[];

export type ArticuloKey = (typeof ARTICULOS_CLASES)[number];
export type ConteoArticulos = Record<ArticuloKey, number>;

const SCORE_THRESHOLD = 0.25;
const NMS_IOU = 0.45;

type Candidate = { cls: number; score: number; x1: number; y1: number; x2: number; y2: number };

function overlap(a: Candidate, b: Candidate) {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (width <= 0 || height <= 0) return 0;
  const intersection = width * height;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection;
  return union > 0 ? intersection / union : 0;
}

export function contarDetecciones(output: Float32Array, dims: readonly number[]): number[] {
  const channels = dims[1];
  const anchors = dims[2];
  const classes = channels - 4;
  if (dims.length !== 3 || classes !== ARTICULOS_CLASES.length || output.length !== channels * anchors) {
    throw new Error("modelo-incompatible");
  }
  const candidates: Candidate[] = [];
  for (let anchor = 0; anchor < anchors; anchor++) {
    let best = -1;
    let score = SCORE_THRESHOLD;
    for (let cls = 0; cls < classes; cls++) {
      const value = output[(4 + cls) * anchors + anchor];
      if (value >= score) {
        score = value;
        best = cls;
      }
    }
    if (best < 0) continue;
    const cx = output[anchor];
    const cy = output[anchors + anchor];
    const halfWidth = output[2 * anchors + anchor] / 2;
    const halfHeight = output[3 * anchors + anchor] / 2;
    candidates.push({ cls: best, score, x1: cx - halfWidth, y1: cy - halfHeight, x2: cx + halfWidth, y2: cy + halfHeight });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    if (kept.some((other) => other.cls === candidate.cls && overlap(other, candidate) > NMS_IOU)) continue;
    kept.push(candidate);
  }
  const counts = new Array<number>(classes).fill(0);
  for (const detection of kept) counts[detection.cls] += 1;
  return counts;
}

const STEAMER = ARTICULOS_CLASES.indexOf("steamer");
const BOLSA_STEAMER = ARTICULOS_CLASES.indexOf("bolsa_vapor");

export function inferirSteamerEnBolsa(counts: number[]): number[] {
  if ((counts[STEAMER] ?? 0) > 0 || (counts[BOLSA_STEAMER] ?? 0) === 0) return counts;
  const inferred = [...counts];
  inferred[STEAMER] = counts[BOLSA_STEAMER];
  return inferred;
}

export function sumarConteos(perImage: number[][]): ConteoArticulos {
  const adjusted = perImage.map(inferirSteamerEnBolsa);
  return Object.fromEntries(ARTICULOS_CLASES.map((key, index) => [
    key,
    adjusted.reduce((total, counts) => total + (counts[index] ?? 0), 0),
  ])) as ConteoArticulos;
}
