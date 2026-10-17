import { NextResponse } from "next/server";
import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { weekdayName } from "@/lib/menus";
import { todayKey } from "@/lib/revisiones-display";
import {
  ARTICULOS_CANTIDAD,
  ARTICULOS_SI_NO,
  BUSCAR_POR_SIGNIFICADO_TOOL,
  BUSCAR_REVISIONES_TOOL,
  BUSQUEDA_PAGINA,
  ELEGIR_IDS_TOOL,
  buscarRevisiones,
  idsElegidos,
  notasParaLectura,
  parseFiltros,
  parseFiltrosSignificado,
  respuestaPlantilla,
  resumenParaModelo,
  serializarFiltros,
  textoLectura,
  type FiltrosBusqueda,
} from "@/lib/busqueda-revisiones";
import type { InicioRevisionRow } from "@/types/database";

export const maxDuration = 30;

const MODEL = "deepseek/deepseek-v4.1-flash-1017";
// Búsqueda + respuesta, con margen para una búsqueda más; la elección de ids tras leer notas va dentro de la misma ronda.
const MAX_RONDAS = 4;
const MODEL_MAX_MS = 12_000;
const LECTURA_MAX_MS = 15_000;
const LECTURA_MAX_TOKENS = 1_500;
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
Usa siempre una herramienta para responder (buscar_revisiones o buscar_por_significado); nunca inventes datos. Interpreta sinónimos (tele o TV = controles_tv, parlante o bocina = speaker, Chromecast = chromecast).
Para fechas relativas (ayer, la semana pasada, en septiembre) usa periodo en vez de calcular fechas; desde/hasta solo para rangos que periodo no cubra.
Para "la última vez" usa orden reciente con limite 1; para "la primera vez", orden antigua con limite 1. Para "cuántas veces" responde con el total.
texto acepta palabras sueltas (deben aparecer todas); no agregues variantes de acentos ni plurales. Úsalo solo para términos literales: un artículo o una palabra concreta.
Para preguntas por concepto o significado (préstamos, cosas que el huésped se llevó o pidió, daños, quejas, faltantes, limpieza o moho, objetos olvidados, movimientos entre casitas, etc.) usa buscar_por_significado: lees las notas y eliges las que corresponden aunque usen otras palabras. En concepto describe la idea con las formas en que suele escribirse.
Ejemplos de argumentos:
"¿cuándo fue la última vez que faltó el control en la casita 12?" → {"casitas":[12],"cantidades":[{"articulo":"controles_tv","comparacion":"<","cantidad":1}],"orden":"reciente","limite":1}
"revisiones de Ana la semana pasada" → {"quien_revisa":"Ana","periodo":"semana_pasada"}
"notas sobre baños sucios este mes" → {"texto":"baño sucio","periodo":"este_mes"}
"¿cuántos check in hubo ayer?" → {"estado_caja_fuerte":"Check in","periodo":"ayer"}
"casas a las que se les ha prestado un artículo" → buscar_por_significado {"concepto":"préstamo de artículos al huésped (prestado, se devuelve, a petición/solicitud del huésped, se lleva a otra casita por pedido)"}
Las notas y la nota extra son texto libre escrito por quien revisa: para buscar una palabra literal en ellas usa texto, para un concepto usa buscar_por_significado, y para saber si una revisión tiene nota o nota extra usa con_nota o con_nota_extra. Cuando la respuesta dependa de una nota, resume lo que dice.
Responde en español, en una o dos oraciones cortas, con fechas legibles como "3 de octubre a las 8:42" y sin mencionar campos técnicos, herramientas ni referencias internas.
Tu respuesta es final: nunca termines con preguntas, ofrecimientos ni sugerencias de seguir buscando.`;
}

function sinPreguntaFinal(texto: string) {
  const oraciones = texto.match(/[^.!?¿¡]*(?:[¿¡][^?!]*[?!]|[.!?]+|$)/g)?.map((parte) => parte.trim()).filter(Boolean) ?? [texto];
  while (oraciones.length > 1 && /[?]$/.test(oraciones[oraciones.length - 1])) oraciones.pop();
  return oraciones.join(" ");
}

type Herramienta = typeof BUSCAR_REVISIONES_TOOL | typeof BUSCAR_POR_SIGNIFICADO_TOOL | typeof ELEGIR_IDS_TOOL;
type Opciones = {
  tools: Herramienta[];
  toolChoice: "required" | "auto" | { type: "function"; function: { name: string } };
  maxTokens?: number;
};

async function llamarModelo(apiKey: string, messages: Mensaje[], opciones: Opciones, timeoutMs: number) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: opciones.tools,
      tool_choice: opciones.toolChoice,
      parallel_tool_calls: false,
      reasoning: { enabled: false },
      provider: { sort: "latency" },
      temperature: 0,
      max_tokens: opciones.maxTokens ?? 400,
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
const FORZAR_ELECCION = { type: "function", function: { name: ELEGIR_IDS_TOOL.function.name } } as const;

type Lectura = { filtros: FiltrosBusqueda; refs: Map<number, string> };

// elegir_ids solo se ofrece cuando ya hay notas leídas, y queda disponible después para que el historial sea coherente.
function herramientas(lectura: Lectura | null): Herramienta[] {
  return lectura ? [BUSCAR_REVISIONES_TOOL, BUSCAR_POR_SIGNIFICADO_TOOL, ELEGIR_IDS_TOOL] : [BUSCAR_REVISIONES_TOOL, BUSCAR_POR_SIGNIFICADO_TOOL];
}

function restanteMs(inicio: number) {
  return DEADLINE_MS - (Date.now() - inicio) - RESERVA_CONSULTA_MS;
}

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

  let lectura: Lectura | null = null;
  let falloLectura: unknown = null;

  // Con ids elegidos, la consulta final reutiliza los filtros estructurados de la lectura.
  async function aplicarEleccion(argumentos: string, actual: Lectura) {
    const filtros: FiltrosBusqueda = { ...actual.filtros, ids: idsElegidos(JSON.parse(argumentos || "{}") as unknown, actual.refs) };
    const { total, rows } = await buscarRevisiones(client, filtros, { offset: 0, limit: BUSQUEDA_PAGINA });
    ultima = { filtros, total, rows };
    return resumenParaModelo(total, rows.slice(0, filtros.limite));
  }

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const restante = restanteMs(inicio);
    if (restante < MIN_LLAMADA_MS) break;
    let message: Mensaje;
    try {
      message = await llamarModelo(apiKey, messages, { tools: herramientas(lectura), toolChoice: ronda === 0 ? "required" : "auto" }, Math.min(MODEL_MAX_MS, restante));
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
    let leyo = false;
    for (const [index, call] of calls.entries()) {
      let resultado = IGNORADA;
      if (index === 0) {
        try {
          const argumentos = JSON.parse(call.function.arguments || "{}") as unknown;
          if (call.function.name === BUSCAR_POR_SIGNIFICADO_TOOL.function.name) {
            const filtros = parseFiltrosSignificado(argumentos, hoy);
            const { refs, lineas, truncado } = await notasParaLectura(client, filtros);
            if (refs.size) {
              lectura = { filtros, refs };
              leyo = true;
              resultado = textoLectura((argumentos as { concepto?: unknown } | null)?.concepto, lineas, truncado);
            } else {
              ultima = { filtros: { ...filtros, ids: [] }, total: 0, rows: [] };
              valida = true;
              resultado = resumenParaModelo(0, []);
            }
          } else if (call.function.name === ELEGIR_IDS_TOOL.function.name) {
            if (!lectura) throw new Error("sin lectura");
            resultado = await aplicarEleccion(call.function.arguments, lectura);
            valida = true;
          } else {
            const filtros = parseFiltros(argumentos, { hoy, periodoManda: true });
            const { total, rows } = await buscarRevisiones(client, filtros, { offset: 0, limit: BUSQUEDA_PAGINA });
            ultima = { filtros, total, rows };
            valida = true;
            resultado = resumenParaModelo(total, rows.slice(0, filtros.limite));
          }
        } catch {
          resultado = JSON.stringify({ error: "No se pudo ejecutar esa búsqueda." });
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: resultado });
    }
    // Tras leer notas, el modelo elige ids en una llamada forzada con el tiempo que quede (máx. 15 s).
    if (leyo && lectura) {
      const disponible = restanteMs(inicio);
      try {
        if (disponible < MIN_LLAMADA_MS) throw new DOMException("sin tiempo para elegir", "TimeoutError");
        const eleccion = await llamarModelo(
          apiKey,
          messages,
          { tools: herramientas(lectura), toolChoice: FORZAR_ELECCION, maxTokens: LECTURA_MAX_TOKENS },
          Math.min(LECTURA_MAX_MS, disponible),
        );
        const call = eleccion.tool_calls?.find((item) => item.function.name === ELEGIR_IDS_TOOL.function.name);
        if (!call) throw new Error("sin elección");
        messages.push({ role: "assistant", content: eleccion.content ?? null, tool_calls: [call] });
        messages.push({ role: "tool", tool_call_id: call.id, content: await aplicarEleccion(call.function.arguments, lectura) });
        valida = true;
      } catch (error) {
        console.error("buscar-revisiones: falló la lectura", error instanceof Error ? error.message : "error");
        falloLectura = error;
        break;
      }
    }
    if (ronda === 0 && valida && calls.length === 1 && ultima) {
      respuesta = respuestaPlantilla(pregunta, ultima.filtros, ultima.total, ultima.rows, hoy);
      if (respuesta) break;
    }
  }
  if (!ultima && falloLectura) {
    return esTimeout(falloLectura)
      ? fail("La búsqueda por significado tardó demasiado. Inténtalo de nuevo o con un periodo más corto.", 504)
      : fail("No pudimos completar la búsqueda. Inténtalo de nuevo.", 502);
  }
  if (!ultima) return fail("No entendimos la búsqueda. Prueba escribiéndola de otra forma.", 422);
  const { filtros, total, rows } = ultima;
  respuesta ??= respuestaPlantilla(pregunta, filtros, total, rows, hoy, true);
  return NextResponse.json({ respuesta, filtros: serializarFiltros(filtros), total, revisiones: rows }, { headers: NO_STORE });
}
