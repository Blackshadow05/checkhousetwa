import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { puedeEditarImagen } from "@/lib/editar-imagen";

export const maxDuration = 120;

const MODEL = "gpt-image-2.5-flare";
const MAX_IMAGE_BYTES = 4_000_000;
const NO_STORE = { "Cache-Control": "private, no-store" };
const PROMPT = "Elimina por completo el fondo de esta imagen y déjalo transparente. Conserva intactos y sin ningún cambio al sujeto (personas, personajes y objetos que sostienen) y todas las letras y textos, incluyendo sus contornos, colores, tipografía, posición y tamaño. No agregues, quites ni redibujes nada más; solo retira el fondo.";

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const usuario = await getSesionUsuario();
  if (!usuario) return fail("Inicia sesión para editar imágenes.", 401);
  if (!puedeEditarImagen(usuario.id)) return fail("No tienes acceso a esta herramienta.", 403);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return fail("La edición de imágenes no está configurada en el servidor.", 503);

  const mimeType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return fail("El archivo enviado no es una imagen válida.", 415);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return fail("La imagen es demasiado grande.", 413);

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return fail("No se recibió una imagen.", 400);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return fail("La imagen es demasiado grande.", 413);
  } catch {
    return fail("No se pudo leer la imagen.", 400);
  }

  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", PROMPT);
  form.append("image", new Blob([bytes], { type: mimeType }), `imagen.${mimeType.split("/")[1]}`);
  form.append("quality", "low");
  form.append("size", "auto");
  form.append("background", "transparent");
  form.append("output_format", "png");
  form.append("moderation", "low");
  form.append("n", "1");

  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(110_000),
      body: form,
    });
    if (!response.ok) {
      const detalle = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
      console.error("quitar-fondo: OpenAI respondió", response.status, detalle?.error?.code ?? "");
      if (detalle?.error?.code === "moderation_blocked") return fail("OpenAI no permite editar esta imagen (personaje protegido o contenido sensible). Prueba con otra.", 422);
      return response.status === 429
        ? fail("Se alcanzó el límite de ediciones. Inténtalo en unos minutos.", 429)
        : response.status === 400
          ? fail("La IA no pudo procesar esta imagen. Prueba con otra.", 422)
          : fail("No se pudo editar la imagen. Inténtalo de nuevo.", 502);
    }
    const body = (await response.json()) as { data?: { b64_json?: unknown }[] };
    const b64 = body.data?.[0]?.b64_json;
    if (typeof b64 !== "string" || !b64) return fail("La IA no devolvió una imagen.", 502);
    return new Response(Buffer.from(b64, "base64"), { headers: { ...NO_STORE, "Content-Type": "image/png" } });
  } catch (error) {
    console.error("quitar-fondo:", error instanceof Error ? error.name : "error");
    return fail("No se pudo editar la imagen. Inténtalo de nuevo.", 502);
  }
}
