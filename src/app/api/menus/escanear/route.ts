import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { weekdayName } from "@/lib/menus";
import { normalizarMenusEscaneados } from "@/lib/menu-scan";
import { todayKey } from "@/lib/revisiones-display";

export const maxDuration = 45;

const MODEL = "gemini-3.5-flash-lite";
const MAX_IMAGE_BYTES = 4_000_000;
const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function responseText(body: unknown) {
  const parts = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map(part => (typeof part?.text === "string" ? part.text : "")).join("").trim();
}

export async function POST(request: Request) {
  if (!(await getSesionUsuario())) return fail("Inicia sesión para escanear el menú.", 401);
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) return fail("El escaneo de menús no está configurado en el servidor.", 503);

  const mimeType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return fail("El archivo enviado no es una imagen válida.", 415);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return fail("La imagen es demasiado grande.", 413);

  let image: string;
  try {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return fail("No se recibió una imagen.", 400);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return fail("La imagen es demasiado grande.", 413);
    image = Buffer.from(bytes).toString("base64");
  } catch {
    return fail("No se pudo leer la imagen.", 400);
  }

  const hoy = todayKey();
  const prompt = `Hoy es ${weekdayName(hoy).toLowerCase()} ${hoy}. Extrae el menú de comida de la imagen: un objeto por día con su fecha (YYYY-MM-DD) y los platillos tal como aparecen escritos. Si la imagen no trae fechas completas, calcula cada una a partir de hoy y de los días de la semana indicados, usando la fecha más cercana. Ignora títulos, precios y cualquier texto que no sea un platillo.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(40_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: image, mimeType } }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              menus: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD." },
                    comidas: { type: "array", items: { type: "string" } },
                  },
                  required: ["fecha", "comidas"],
                },
              },
            },
            required: ["menus"],
          },
        },
      }),
    });
    if (!response.ok) {
      console.error("scan-menu: Gemini respondió", response.status);
      return response.status === 429
        ? fail("Se alcanzó el límite de escaneos. Inténtalo en unos minutos.", 429)
        : fail("No se pudo leer la imagen. Inténtalo de nuevo.", 502);
    }
    const text = responseText(await response.json());
    if (!text) return fail("No encontramos un menú en la imagen. Prueba con otra foto.", 422);
    const menus = normalizarMenusEscaneados(JSON.parse(text));
    if (!menus.length) return fail("No encontramos un menú en la imagen. Prueba con otra foto.", 422);
    return NextResponse.json({ menus }, { headers: NO_STORE });
  } catch (error) {
    console.error("scan-menu:", error instanceof Error ? error.name : "error");
    return fail("No se pudo leer la imagen. Inténtalo de nuevo.", 502);
  }
}
