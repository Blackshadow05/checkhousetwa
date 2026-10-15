import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { weekdayName } from "@/lib/menus";
import { todayKey } from "@/lib/revisiones-display";
import {
  ARTICULOS_CANTIDAD,
  ARTICULOS_SI_NO,
  BUSCAR_REVISIONES_TOOL,
  buscarRevisiones,
  parseFiltros,
  resumenParaModelo,
} from "@/lib/busqueda-revisiones";
import type { InicioRevisionRow } from "@/types/database";

export const maxDuration = 30;

const MODEL = "anthropic/claude-haiku-5.5";
const MAX_RONDAS = 3;
const MODEL_MAX_MS = 12_000;
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
Usa siempre la herramienta buscar_revisiones para responder; nunca inventes datos. Interpreta sinónimos (tele o TV = controles_tv, parlante o bocina = speaker, Chromecast = chromecast) y fechas relativas (ayer, la semana pasada, en septiembre) convirtiéndolas a YYYY-MM-DD.
Para "la última vez" usa orden reciente con limite 1; para "la primera vez", orden antigua con limite 1. Para "cuántas veces" responde con el total.
Si una búsqueda no da resultados y tiene sentido, prueba una vez con filtros menos estrictos y dilo.
Las notas y la nota extra son texto libre escrito por quien revisa: para preguntas sobre su contenido usa texto, y para saber si una revisión tiene nota o nota extra usa con_nota o con_nota_extra. Cuando la respuesta dependa de una nota, resume lo que dice.
Responde en español, en una o dos oraciones cortas, con fechas legibles como "3 de octubre a las 8:42" y sin mencionar campos técnicos, herramientas ni referencias internas.
Tu respuesta es final: nunca termines con preguntas, ofrecimientos ni sugerencias de seguir buscando.`;
}

function sinPreguntaFinal(texto: string) {
  const oraciones = texto.match(/[^.!?¿¡]*(?:[¿¡][^?!]*[?!]|[.!?]+|$)/g)?.map((parte) => parte.trim()).filter(Boolean) ?? [texto];
  while (oraciones.length > 1 && /[?]$/.test(oraciones[oraciones.length - 1])) oraciones.pop();
  return oraciones.join(" ");
}

async function llamarModelo(apiKey: string, messages: Mensaje[], forzarHerramienta: boolean) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(MODEL_MAX_MS),
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [BUSCAR_REVISIONES_TOOL],
      tool_choice: forzarHerramienta ? "required" : "auto",
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

export async function POST(request: Request) {
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

  const client = createAdminClient();
  const messages: Mensaje[] = [
    { role: "system", content: instrucciones(todayKey()) },
    { role: "user", content: pregunta },
  ];
  const vistas = new Map<string, InicioRevisionRow>();
  let ultimas: InicioRevisionRow[] = [];

  try {
    for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
      const message = await llamarModelo(apiKey, messages, ronda === 0);
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        const respuesta = message.content?.trim() ? sinPreguntaFinal(message.content.trim()) : "";
        if (!respuesta) break;
        return NextResponse.json({ respuesta, revisiones: ultimas }, { headers: NO_STORE });
      }
      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let resultado: string;
        try {
          const { total, rows } = await buscarRevisiones(client, parseFiltros(JSON.parse(call.function.arguments || "{}")));
          for (const row of rows) vistas.set(row.id, row);
          ultimas = rows;
          resultado = resumenParaModelo(total, rows);
        } catch {
          resultado = JSON.stringify({ error: "No se pudo ejecutar esa búsqueda." });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: resultado });
      }
    }
  } catch (error) {
    console.error("buscar-revisiones: falló", error instanceof Error ? error.message : "error");
    return fail("No pudimos completar la búsqueda. Inténtalo de nuevo.", 502);
  }
  if (vistas.size) {
    return NextResponse.json({ respuesta: null, revisiones: ultimas }, { headers: NO_STORE });
  }
  return fail("No entendimos la búsqueda. Prueba escribiéndola de otra forma.", 422);
}
