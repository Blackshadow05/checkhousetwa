import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";

export const maxDuration = 30;

const MODEL = "google/gemini-3.5-flash-lite";
const MODEL_MAX_MS = 25_000;
const MAX_BYTES = 10 * 1024 * 1024;
const FORMATOS = ["wav", "mp3", "m4a", "aac", "ogg", "flac", "webm", "aiff"] as const;
const NO_STORE = { "Cache-Control": "private, no-store" };
const INSTRUCCION = "Transcribe literalmente este audio en español. Devuelve solo el texto transcrito, sin comillas, comentarios ni explicaciones. Si no hay voz, devuelve una cadena vacía.";
const ERROR_TRANSCRIPCION = "No se pudo transcribir el audio.";

type Formato = (typeof FORMATOS)[number];

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function esFormato(valor: unknown): valor is Formato {
  return typeof valor === "string" && (FORMATOS as readonly string[]).includes(valor);
}

function formatoDeTipo(tipo: string): Formato {
  if (tipo.includes("wav")) return "wav";
  if (tipo.includes("mpeg") || tipo.includes("mp3")) return "mp3";
  if (tipo.includes("mp4") || tipo.includes("m4a")) return "m4a";
  if (tipo.includes("aac")) return "aac";
  if (tipo.includes("ogg")) return "ogg";
  if (tipo.includes("flac")) return "flac";
  if (tipo.includes("aiff")) return "aiff";
  return "webm";
}

function limpiarTexto(texto: string) {
  return texto
    .trim()
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  if (!(await getSesionUsuario())) return fail("Inicia sesión para dictar.", 401);
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return fail("El dictado por voz no está configurado en el servidor.", 503);

  const longitud = Number(request.headers.get("content-length"));
  if (Number.isFinite(longitud) && longitud > MAX_BYTES + 64 * 1024) return fail("El audio es demasiado largo.", 413);

  let audio: Blob;
  let formato: Formato;
  try {
    const datos = await request.formData();
    const archivo = datos.get("audio");
    if (!(archivo instanceof Blob)) return fail("No se recibió audio.", 400);
    audio = archivo;
    const formatoPedido = datos.get("format");
    formato = esFormato(formatoPedido) ? formatoPedido : formatoDeTipo(archivo.type);
  } catch {
    return fail("No se pudo leer el audio.", 400);
  }
  if (!audio.size) return fail("No se recibió audio.", 400);
  if (audio.size > MAX_BYTES) return fail("El audio es demasiado largo.", 413);

  try {
    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(MODEL_MAX_MS),
      body: JSON.stringify({
        model: MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: INSTRUCCION },
            { type: "input_audio", input_audio: { data, format: formato } },
          ],
        }],
        temperature: 0,
        max_tokens: 1000,
      }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("sin respuesta");
    return NextResponse.json({ texto: limpiarTexto(content) }, { headers: NO_STORE });
  } catch (error) {
    console.error("transcribir-revisiones: falló", error instanceof Error ? error.message : "error");
    return fail(ERROR_TRANSCRIPCION, 502);
  }
}
