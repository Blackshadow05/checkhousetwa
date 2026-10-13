import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { weekdayName } from "@/lib/menus";
import { normalizarMenusEscaneados } from "@/lib/menu-scan";
import { todayKey } from "@/lib/revisiones-display";

export const maxDuration = 45;

const MODEL = "gemini-3.5-flash-lite";
const RESPALDO_MODEL = "gpt-6-luna";
const GEMINI_MAX_MS = 25_000;
const RESPALDO_MAX_MS = 12_000;
const MAX_IMAGE_BYTES = 4_000_000;
const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

const SCHEMA = {
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
};

class FalloLectura extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

function responseText(body: unknown) {
  const parts = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map(part => (typeof part?.text === "string" ? part.text : "")).join("").trim();
}

function outputText(body: unknown) {
  const output = (body as { output?: { content?: { type?: unknown; text?: unknown }[] }[] })?.output;
  if (!Array.isArray(output)) return "";
  return output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .map(part => (part?.type === "output_text" && typeof part.text === "string" ? part.text : ""))
    .join("").trim();
}

function menusDesde(text: string) {
  if (!text) return [];
  try {
    return normalizarMenusEscaneados(JSON.parse(text));
  } catch {
    return [];
  }
}

async function leerConGemini(apiKey: string, prompt: string, image: string, mimeType: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(GEMINI_MAX_MS),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: image, mimeType } }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
    }),
  });
  if (!response.ok) throw new FalloLectura(response.status);
  return menusDesde(responseText(await response.json()));
}

async function leerConRespaldo(apiKey: string, prompt: string, image: string, mimeType: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(RESPALDO_MAX_MS),
    body: JSON.stringify({
      model: RESPALDO_MODEL,
      reasoning: { effort: "none" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:${mimeType};base64,${image}` },
        ],
      }],
      text: { format: { type: "json_schema", name: "menu_semanal", strict: true, schema: SCHEMA } },
    }),
  });
  if (!response.ok) throw new FalloLectura(response.status);
  return menusDesde(outputText(await response.json()));
}

export async function POST(request: Request) {
  if (!(await getSesionUsuario())) return fail("Inicia sesión para escanear el menú.", 401);
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.VITE_GEMINI_API_KEY?.trim();
  const respaldoKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey && !respaldoKey) return fail("El escaneo de menús no está configurado en el servidor.", 503);

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
  const prompt = `Hoy es ${weekdayName(hoy).toLowerCase()} ${hoy}. Extrae el menú de comida de la imagen: un objeto por día con su fecha (YYYY-MM-DD) y los platillos tal como aparecen escritos. Si la imagen no trae fechas completas, calcula cada una a partir de hoy y de los días de la semana indicados, usando la fecha más cercana. Ignora títulos, precios y cualquier texto que no sea un platillo. Omite los días sin servicio, por ejemplo los marcados como OFF, cerrado o libre.`;

  let limite = false;
  if (respaldoKey) {
    try {
      const menus = await leerConRespaldo(respaldoKey, prompt, image, mimeType);
      if (menus.length) return NextResponse.json({ menus }, { headers: NO_STORE });
      console.error("scan-menu: Luna no devolvió menús");
    } catch (error) {
      limite = error instanceof FalloLectura && error.status === 429;
      console.error("scan-menu: Luna falló", error instanceof FalloLectura ? error.status : error instanceof Error ? error.name : "error");
    }
  }
  if (apiKey) {
    try {
      const menus = await leerConGemini(apiKey, prompt, image, mimeType);
      if (menus.length) return NextResponse.json({ menus }, { headers: NO_STORE });
      return fail("No encontramos un menú en la imagen. Prueba con otra foto.", 422);
    } catch (error) {
      limite = (limite || !respaldoKey) && error instanceof FalloLectura && error.status === 429;
      console.error("scan-menu: Gemini falló", error instanceof FalloLectura ? error.status : error instanceof Error ? error.name : "error");
    }
  }
  return limite
    ? fail("Se alcanzó el límite de escaneos. Inténtalo en unos minutos.", 429)
    : fail("No se pudo leer la imagen. Inténtalo de nuevo.", 502);
}
