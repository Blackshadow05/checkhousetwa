import { NextResponse } from "next/server";

type VisionCandidate = { id: number; x: number; y: number; kind: "seguro" | "dudoso" };
type VisionVerdict = { id: number; verdict: "defecto" | "reflejo"; reason?: string };

const MODEL = "gpt-5.6-luna";
const MAX_IMAGE_BASE64 = 6_000_000; // ~4.5 MB of image data
const MAX_CANDIDATES = 30;
const VERDICT_INSTRUCTIONS = `Eres un inspector técnico de pantallas de televisión. La foto muestra un televisor que debería estar apagado o mostrando una imagen oscura y uniforme.

Un DEFECTO LUMINOSO del panel (punto blanco, fuga de luz de la retroiluminación, píxeles atascados) es una mancha luminosa difusa, aproximadamente redonda y uniforme, sin estructura interna: su brillo cae de forma gradual y simétrica hacia los bordes, no contiene siluetas, texto ni textura, y no coincide con objetos del entorno (lámparas, ventanas, personas) visibles en la habitación.

Un REFLEJO es una mancha brillante causada por luces u objetos del entorno reflejados en el cristal. Pistas: contiene textura, siluetas, bordes duros o detalles internos; cambia de forma o se alarga en perspectiva; coincide con fuentes de luz visibles en la habitación; o aparece por fuera del panel.

Determina cuáles candidatos corresponden a defectos luminosos del panel y cuáles parecen reflejos. Los candidatos "dudosos" necesitan tu juicio visual con atención. Los candidatos "seguros" ya fueron verificados por el análisis local: confirma el veredicto "defecto" salvo que claramente sea un reflejo.`;

function candidateList(candidates: VisionCandidate[]) {
  return candidates
    .map(candidate => `${candidate.id}. x=${Math.round(candidate.x * 100)}%, y=${Math.round(candidate.y * 100)}% — ${candidate.kind}`)
    .join("\n");
}

function parseVerdicts(payload: unknown, candidates: VisionCandidate[]): VisionVerdict[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { veredictos?: unknown }).veredictos)) return null;
  const byId = new Map<number, "defecto" | "reflejo">();
  for (const item of (payload as { veredictos: unknown[] }).veredictos) {
    if (!item || typeof item !== "object") continue;
    const { id, verdict } = item as { id?: unknown; verdict?: unknown };
    if (typeof id === "number" && (verdict === "defecto" || verdict === "reflejo")) byId.set(id, verdict);
  }
  if (!byId.size) return null;
  // Never drop a candidate silently: Luna must judge every marked spot.
  return candidates.map(candidate => ({
    id: candidate.id,
    verdict: byId.get(candidate.id) ?? (candidate.kind === "seguro" ? "defecto" : "reflejo"),
  }));
}

function outputText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "La revisión con IA no está configurada en el servidor." }, { status: 503 });
  let image = "";
  let candidates: VisionCandidate[] = [];
  try {
    const body = (await request.json()) as { image?: unknown; candidates?: unknown };
    if (typeof body.image !== "string" || !body.image || body.image.length > MAX_IMAGE_BASE64) return NextResponse.json({ error: "La imagen es inválida o demasiado grande." }, { status: 400 });
    if (!Array.isArray(body.candidates) || !body.candidates.length || body.candidates.length > MAX_CANDIDATES) return NextResponse.json({ error: "No hay candidatos válidos para revisar." }, { status: 400 });
    candidates = body.candidates.map(item => {
      const candidate = item as Partial<VisionCandidate>;
      return { id: Number(candidate.id), x: Number(candidate.x), y: Number(candidate.y), kind: candidate.kind === "seguro" ? "seguro" : "dudoso" } as VisionCandidate;
    });
    if (candidates.some(candidate => !Number.isSafeInteger(candidate.id) || candidate.id < 1 || !(candidate.x >= 0 && candidate.x <= 1) || !(candidate.y >= 0 && candidate.y <= 1))) {
      return NextResponse.json({ error: "Las coordenadas de los candidatos son inválidas." }, { status: 400 });
    }
    image = body.image;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const prompt = `Sobre la foto se dibujaron marcadores numerados: un círculo y su número indican el centro exacto de cada candidato, en la misma posición que estas coordenadas normalizadas (porcentaje del ancho y del alto de la imagen):

${candidateList(candidates)}

Determina cuáles corresponden a defectos luminosos del panel y cuáles parecen reflejos. Devuelve un veredicto para cada número.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: MODEL,
        instructions: VERDICT_INSTRUCTIONS,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: `data:image/jpeg;base64,${image}`, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "revision_puntos_pantalla",
            strict: true,
            schema: {
              type: "object",
              properties: {
                veredictos: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      verdict: { type: "string", enum: ["defecto", "reflejo"] },
                      reason: { type: "string" },
                    },
                    required: ["id", "verdict", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["veredictos"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    if (!response.ok) return NextResponse.json({ error: `La revisión con IA falló (${response.status}).` }, { status: 502 });
    const text = outputText(await response.json());
    const parsed = text ? parseVerdicts(JSON.parse(text), candidates) : null;
    if (!parsed) return NextResponse.json({ error: "La IA devolvió una respuesta incompleta." }, { status: 502 });
    return NextResponse.json({ veredictos: parsed }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar el servicio de IA." }, { status: 502 });
  }
}

