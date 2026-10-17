import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { weekdayName } from "@/lib/menus";
import { todayKey } from "@/lib/revisiones-display";
import {
  ARTICULOS_CANTIDAD,
  ARTICULOS_SI_NO,
  BUSCAR_REVISIONES_TOOL,
  BUSQUEDA_PAGINA,
  buscarRevisiones,
  parseFiltros,
  respuestaPlantilla,
  resumenParaModelo,
  serializarFiltros,
  type FiltrosBusqueda,
} from "@/lib/busqueda-revisiones";
import type { InicioRevisionRow } from "@/types/database";

export const maxDuration = 30;

const MODEL = "deepseek/deepseek-v4.1-flash-1017";
const MAX_RONDAS = 3;
const MODEL_MAX_MS = 12_000;
// Presupuesto global por debajo de maxDuration: cada llamada al modelo deja margen para la consulta que la sigue.
const DEADLINE_MS = 25_000;
const RESERVA_CONSULTA_MS = 3_000;
const MIN_LLAMADA_MS = 2_500;
const MAX_PREGUNTA = 300;
const NO_STORE = { "Cache-Control": "private, no-store" };

type Mensaje = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function instrucciones(hoy: string) {
  const cantidades = Object.entries(ARTICULOS_CANTIDAD).map(([key, label]) => `${key} (${label})`).join(", ");
  const siNo = Object.entries(ARTICULOS_SI_NO).map(([key, label]) => `${key} (${label})`).join(", ");
  return `Eres el buscador de revisiones de casitas de un hotel. Hoy es ${weekdayName(hoy).toLowerCase()} ${hoy}, hora de Costa Rica.
Cada revisión registra la casita, quién la revisó, la fecha, el estado de la caja fuerte y el inventario contado.
Artículos con cantidad: ${cantidades}.
Artículos de sí o no: ${siNo}.
Usa siempre la herramienta buscar_revisiones para responder; nunca inventes datos. Interpreta sinónimos (tele o TV = controles_tv, parlante o bocina = speaker, Chromecast = chromecast).
Para fechas relativas (ayer, la semana pasada, en septiembre) usa periodo en vez de calcular fechas; desde/hasta solo para rangos que periodo no cubra.
Para "la última vez" usa orden reciente con limite 1; para "la primera vez", orden antigua con limite 1. Para "cuántas veces" responde con el total.
texto acepta palabras sueltas (deben aparecer todas); no agregues variantes de acentos ni plurales.
Ejemplos de argumentos:
"¿cuándo fue la última vez que faltó el control en la casita 12?" → {"casitas":[12],"cantidades":[{"articulo":"controles_tv","comparacion":"<","cantidad":1}],"orden":"reciente","limite":1}
"revisiones de Ana la semana pasada" → {"quien_revisa":"Ana","periodo":"semana_pasada"}
"notas sobre baños sucios este mes" → {"texto":"baño sucio","periodo":"este_mes"}
"¿cuántos check in hubo ayer?" → {"estado_caja_fuerte":"Check in","periodo":"ayer"}
Las notas y la nota extra son texto libre escrito por quien revisa: para preguntas sobre su contenido usa texto, y para saber si una revisión tiene nota o nota extra usa con_nota o con_nota_extra. Cuando la respuesta dependa de una nota, resume lo que dice.
Responde en español, en una o dos oraciones cortas, con fechas legibles como "3 de octubre a las 8:42" y sin mencionar campos técnicos, herramientas ni referencias internas.
Tu respuesta es final: nunca termines con preguntas, ofrecimientos ni sugerencias de seguir buscando.`;
}

function sinPreguntaFinal(texto: string) {
  const oraciones = texto.match(/[^.!?¿¡]*(?:[¿¡][^?!]*[?!]|[.!?]+|$)/g)?.map((parte) => parte.trim()).filter(Boolean) ?? [texto];
  while (oraciones.length > 1 && /[?]$/.test(oraciones[oraciones.length - 1])) oraciones.pop();
  return oraciones.join(" ");
}

async function llamarModelo(apiKey: string, messages: Mensaje[], forzarHerramienta: boolean, timeoutMs: number) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [BUSCAR_REVISIONES_TOOL],
      tool_choice: forzarHerramienta ? "required" : "auto",
      parallel_tool_calls: false,
      reasoning: { enabled: false },
      provider: { sort: "latency" },
      temperature: 0,
      max_tokens: 400,
    }),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const body = await response.json() as { choices?: { message?: Mensaje }[] };
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error("sin respuesta");
  return message;
}

function esTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

const IGNORADA = JSON.stringify({ error: "Ignorada: haz una sola búsqueda por vez." });

export async function POST(request: Request) {
  const inicio = Date.now();
  if (!(await getSesionUsuario())) return fail("Inicia sesión para buscar.", 401);
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return fail("La búsqueda inteligente no está configurada en el servidor.", 503);

  let pregunta = "";
  try {
    const body = await request.json() as { pregunta?: unknown };
    pregunta = typeof body?.pregunta === "string" ? body.pregunta.replace(/\s+/g, " ").trim().slice(0, MAX_PREGUNTA) : "";
  } catch {
    return fail("No se pudo leer la búsqueda.", 400);
  }
  if (pregunta.length < 3) return fail("Escribe qué quieres buscar.", 400);

  const hoy = todayKey();
  const client = createAdminClient();
  const messages: Mensaje[] = [
    { role: "system", content: instrucciones(hoy) },
    { role: "user", content: pregunta },
  ];
  // Última búsqueda válida: ya trae la primera página, así no hace falta repetir la consulta al final.
  let ultima: { filtros: FiltrosBusqueda; total: number; rows: InicioRevisionRow[] } | null = null;
  let respuesta: string | null = null;

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const restante = DEADLINE_MS - (Date.now() - inicio) - RESERVA_CONSULTA_MS;
    if (restante < MIN_LLAMADA_MS) break;
    let message: Mensaje;
    try {
      message = await llamarModelo(apiKey, messages, ronda === 0, Math.min(MODEL_MAX_MS, restante));
    } catch (error) {
      console.error("buscar-revisiones: falló", error instanceof Error ? error.message : "error");
      if (!ultima) return fail(esTimeout(error) ? "La búsqueda tardó demasiado. Inténtalo de nuevo." : "No pudimos completar la búsqueda. Inténtalo de nuevo.", esTimeout(error) ? 504 : 502);
      break;
    }
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      respuesta = message.content?.trim() ? sinPreguntaFinal(message.content.trim()) : null;
      break;
    }
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    // parallel_tool_calls va en false; si igual llegan varias, solo se ejecuta la primera y las demás
    // reciben un resultado de error para no romper el protocolo de mensajes.
    let valida = false;
    for (const [index, call] of calls.entries()) {
      let resultado = IGNORADA;
      if (index === 0) {
        try {
          const filtros = parseFiltros(JSON.parse(call.function.arguments || "{}") as unknown, { hoy, periodoManda: true });
          const { total, rows } = await buscarRevisiones(client, filtros, { offset: 0, limit: BUSQUEDA_PAGINA });
          ultima = { filtros, total, rows };
          valida = true;
          resultado = resumenParaModelo(total, rows.slice(0, filtros.limite));
        } catch {
          resultado = JSON.stringify({ error: "No se pudo ejecutar esa búsqueda." });
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: resultado });
    }
    if (ronda === 0 && valida && calls.length === 1 && ultima) {
      respuesta = respuestaPlantilla(pregunta, ultima.filtros, ultima.total, ultima.rows, hoy);
      if (respuesta) break;
    }
  }
  if (!ultima) return fail("No entendimos la búsqueda. Prueba escribiéndola de otra forma.", 422);
  const { filtros, total, rows } = ultima;
  respuesta ??= respuestaPlantilla(pregunta, filtros, total, rows, hoy, true);
  return NextResponse.json({ respuesta, filtros: serializarFiltros(filtros), total, revisiones: rows }, { headers: NO_STORE });
}
