import type { PuntoPantalla } from "./pantalla-detection";

/** A spot whose roundness and brightness measurements are at least 60 % likely
 * a luminous panel defect is confirmed as a white dot. */
const JEV_CONFIRM_THRESHOLD = 0.6;

export type PuntoTriado = PuntoPantalla & { jevProbability?: number };

export type TriageResult = {
  /** Borderline candidates Jev judged more likely than not to be white dots. */
  confirmed: PuntoTriado[];
  /** Borderline candidates still needing a vision verdict (reflections and glare). */
  uncertain: PuntoTriado[];
};

/** Sends every candidate's OpenCV measurements to Jev, which judges roundness,
 * brightness and radial fade without seeing the photo. Throws on any failure
 * so the caller can keep the local OpenCV count untouched. */
export async function triagePuntosConJev(points: PuntoPantalla[], signal?: AbortSignal): Promise<TriageResult> {
  const judged = points.filter(point => point.features);
  if (!judged.length) return { confirmed: [], uncertain: [] };
  const response = await fetch("/api/pantallas/jev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      candidates: judged.map(point => ({
        id: points.indexOf(point) + 1,
        metrics: point.features,
      })),
    }),
  });
  if (!response.ok) throw new Error("La revisión intermedia no estuvo disponible.");
  const payload = (await response.json()) as { veredictos?: { id?: unknown; probability?: unknown }[] };
  if (!Array.isArray(payload.veredictos)) throw new Error("La revisión intermedia devolvió una respuesta incompleta.");
  const probabilities = new Map<number, number>();
  for (const item of payload.veredictos) {
    if (typeof item?.id === "number" && typeof item.probability === "number") probabilities.set(item.id, item.probability);
  }
  const confirmed: PuntoTriado[] = [];
  const uncertain: PuntoTriado[] = [];
  for (const point of judged) {
    const probability = probabilities.get(points.indexOf(point) + 1);
    if (typeof probability !== "number") throw new Error("La revisión intermedia omitió un candidato.");
    const triaged: PuntoTriado = { ...point, jevProbability: probability };
    (probability > JEV_CONFIRM_THRESHOLD ? confirmed : uncertain).push(triaged);
  }
  return { confirmed, uncertain };
}
