import { NextResponse } from "next/server";

type JevCandidate = {
  id: number;
  metrics: {
    circularity: number;
    axisRatio: number;
    contrastPeak: number;
    edgeSharpness: number;
    radialFalloff: number;
    relativeDiameter: number;
  };
};
type JevProbability = { id: number; probability: number };

const MODEL = "jev-latest";
const MAX_CANDIDATES = 30;

const NOUL_INSTRUCTIONS = `According to these image-analysis measurements of a bright spot on a TV screen that should be dark and uniform, is the spot more likely a luminous panel defect (a white dot / backlight pressure spot) than a reflection, on-screen content, or another glare?

Judge shape and brightness only. Panel defects are small, bright, round, uniform, and fade smoothly into the dark panel. Reflections and other glare are elongated or irregular, contain internal texture (silhouettes, edges, scene detail), or do not fade evenly toward every side.

The measurements were extracted by computer vision from a photo of the screen:
- circularity: 1.0 is a perfect circle. Below ~0.8 suggests an irregular outline.
- axisRatio: 1.0 means equally wide in every direction regardless of rotation. Below ~0.8 means an elongated shape, typical of a reflection seen at an angle.
- contrastPeak: how much brighter than the local background, on a 0-255 scale. Defects usually exceed 25.
- edgeSharpness: internal texture of the spot. Above ~10 suggests silhouettes or scene detail from a reflection.
- radialFalloff: brightness drop toward the surroundings. Above ~10 means a smooth, even fade like a real panel defect.
- relativeDiameter: spot diameter as a fraction of the photo's short side. Real defects are roughly 0.01 to 0.08.`;

const NOUL_CRITERIA = {
  true: "The measurements describe a small, round, bright, smooth spot with an even radial fade: a luminous panel defect.",
  false: "The measurements describe an elongated, irregular, dim, or textured spot: a reflection, on-screen content, or another glare.",
};

function isFiniteIn(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function parseProbabilities(payload: unknown, candidates: JevCandidate[]): JevProbability[] | null {
  if (!payload || typeof payload !== "object") return null;
  const answers = (payload as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object") return null;
  const probabilities: JevProbability[] = [];
  for (const candidate of candidates) {
    const answer = (answers as Record<string, unknown>)[`punto_${candidate.id}`];
    const noul = answer && typeof answer === "object" ? (answer as { noul?: unknown }).noul : undefined;
    if (typeof noul !== "number" || !Number.isFinite(noul)) return null;
    probabilities.push({ id: candidate.id, probability: noul });
  }
  return probabilities;
}


export async function POST(request: Request) {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "La revisión intermedia con IA no está configurada en el servidor." }, { status: 503 });
  let candidates: JevCandidate[] = [];
  try {
    const body = (await request.json()) as { candidates?: unknown };
    if (!Array.isArray(body.candidates) || !body.candidates.length || body.candidates.length > MAX_CANDIDATES) return NextResponse.json({ error: "No hay candidatos válidos para valorar." }, { status: 400 });
    candidates = body.candidates.map(item => {
      const candidate = item as Partial<JevCandidate>;
      const metrics = (candidate.metrics ?? {}) as JevCandidate["metrics"];
      return { id: Number(candidate.id), metrics: {
        circularity: Number(metrics.circularity), axisRatio: Number(metrics.axisRatio), contrastPeak: Number(metrics.contrastPeak),
        edgeSharpness: Number(metrics.edgeSharpness), radialFalloff: Number(metrics.radialFalloff), relativeDiameter: Number(metrics.relativeDiameter),
      } };
    });
    const valid = candidates.every(candidate => Number.isSafeInteger(candidate.id) && candidate.id >= 1
      && isFiniteIn(candidate.metrics.circularity, 0, 1) && isFiniteIn(candidate.metrics.axisRatio, 0, 1)
      && isFiniteIn(candidate.metrics.contrastPeak, 0, 255) && isFiniteIn(candidate.metrics.edgeSharpness, 0, 255)
      && isFiniteIn(candidate.metrics.radialFalloff, -255, 255) && isFiniteIn(candidate.metrics.relativeDiameter, 0, 1));
    if (!valid) return NextResponse.json({ error: "Las mediciones de los candidatos son inválidas." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // One Noul per candidate, evaluated together in a single request.
  const questions: Record<string, unknown> = {};
  for (const candidate of candidates) {
    questions[`punto_${candidate.id}`] = {
      type: "noul",
      instructions: { spot: `candidates[${candidate.id - 1}]`, question: `${NOUL_INSTRUCTIONS}\n\nEvaluate \`spot\`.` },
      criteria: NOUL_CRITERIA,
    };
  }
  const state = { candidates: candidates.map(candidate => candidate.metrics) };

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ state, model: MODEL, questions }),
    });
    if (!response.ok) return NextResponse.json({ error: `La revisión intermedia falló (${response.status}).` }, { status: 502 });
    const probabilities = parseProbabilities(await response.json(), candidates);
    if (!probabilities) return NextResponse.json({ error: "La revisión intermedia devolvió una respuesta incompleta." }, { status: 502 });
    return NextResponse.json({ veredictos: probabilities }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar el servicio de IA intermedio." }, { status: 502 });
  }
}
