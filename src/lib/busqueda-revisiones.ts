import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { REVISIONES_TABLE } from "@/lib/constants";
import { INICIO_REVISION_COLUMNS } from "@/lib/revisiones-display";
import { CAJA_FUERTE_FILTERS, parseArchiveDate, shiftDay } from "@/lib/revisiones-archive";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type { Database, InicioRevisionRow, RevisionCasitaInicio } from "@/types/database";

type Client = SupabaseClient<Database>;

export const ARTICULOS_CANTIDAD = {
  chromecast: "Chromecast",
  binoculares: "Binoculares",
  speaker: "Speaker",
  usb_speaker: "USB del speaker",
  controles_tv: "Controles de TV",
  secadora: "Secadora de cabello",
  accesorios_secadora: "Accesorios de secadora",
  steamer: "Steamer",
  plancha_cabello: "Plancha de cabello",
  bolso_yute: "Bolso de yute",
} as const;

export const ARTICULOS_SI_NO = {
  trapo_binoculares: "Trapo de binoculares",
  sombrero: "Sombrero",
  bulto: "Bulto",
  bolsa_vapor: "Bolsa de vapor",
  cola_caballo: "Cola de caballo",
  camas_ordenadas: "Camas ordenadas",
} as const;

type ArticuloCantidad = keyof typeof ARTICULOS_CANTIDAD;
type ArticuloSiNo = keyof typeof ARTICULOS_SI_NO;
type Comparacion = "=" | "!=" | "<" | "<=" | ">" | ">=";

const COMPARACIONES: Comparacion[] = ["=", "!=", "<", "<=", ">", ">="];
const MAX_CANTIDAD = 12;
const MAX_LIMITE = 20;

export const BUSCAR_REVISIONES_TOOL = {
  type: "function",
  function: {
    name: "buscar_revisiones",
    description: "Busca revisiones de casitas guardadas. Todos los filtros se combinan con Y. Devuelve el total de coincidencias y las filas en el orden pedido.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        casitas: { type: "array", items: { type: "integer", minimum: 1, maximum: 99 }, description: "Números de casita." },
        cantidades: {
          type: "array",
          description: "Condiciones sobre la cantidad contada de un artículo.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              articulo: { type: "string", enum: Object.keys(ARTICULOS_CANTIDAD) },
              comparacion: { type: "string", enum: COMPARACIONES },
              cantidad: { type: "integer", minimum: 0, maximum: MAX_CANTIDAD },
            },
            required: ["articulo", "comparacion", "cantidad"],
          },
        },
        presencia: {
          type: "array",
          description: "Condiciones de artículos que se marcan como sí o no.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              articulo: { type: "string", enum: Object.keys(ARTICULOS_SI_NO) },
              hay: { type: "boolean" },
            },
            required: ["articulo", "hay"],
          },
        },
        estado_caja_fuerte: { type: "string", enum: [...CAJA_FUERTE_FILTERS] },
        quien_revisa: { type: "string", description: "Nombre o parte del nombre de quien revisó." },
        texto: { type: "string", description: "Palabras a buscar en notas, nota extra, faltantes y puertas/ventanas." },
        con_nota: { type: "boolean", description: "true: solo revisiones con nota; false: solo sin nota." },
        con_nota_extra: { type: "boolean", description: "true: solo revisiones con nota extra; false: solo sin nota extra." },
        desde: { type: "string", description: "Fecha inicial incluida, YYYY-MM-DD." },
        hasta: { type: "string", description: "Fecha final incluida, YYYY-MM-DD." },
        orden: { type: "string", enum: ["reciente", "antigua"] },
        limite: { type: "integer", minimum: 1, maximum: MAX_LIMITE },
      },
    },
  },
} as const;

function variantes(n: number) {
  return [...new Set([String(n), String(n).padStart(2, "0")])];
}

function cumple(valor: number, comparacion: Comparacion, cantidad: number) {
  switch (comparacion) {
    case "=": return valor === cantidad;
    case "!=": return valor !== cantidad;
    case "<": return valor < cantidad;
    case "<=": return valor <= cantidad;
    case ">": return valor > cantidad;
    case ">=": return valor >= cantidad;
  }
}

function valoresQueCumplen(comparacion: Comparacion, cantidad: number) {
  const valores: string[] = [];
  for (let n = 0; n <= MAX_CANTIDAD; n++) {
    if (cumple(n, comparacion, cantidad)) valores.push(...variantes(n));
  }
  if (cumple(0, comparacion, cantidad)) valores.push("00");
  return [...new Set(valores)];
}

function limpiarTexto(valor: unknown, max = 60) {
  if (typeof valor !== "string") return "";
  return valor.replace(/[,()%_\\*"]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function entero(valor: unknown, min: number, max: number) {
  const n = typeof valor === "number" ? Math.trunc(valor) : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export type FiltrosBusqueda = {
  casitas: number[];
  cantidades: { articulo: ArticuloCantidad; comparacion: Comparacion; cantidad: number }[];
  presencia: { articulo: ArticuloSiNo; hay: boolean }[];
  estado: string | null;
  conNota: boolean | null;
  conNotaExtra: boolean | null;
  quien: string;
  texto: string;
  desde: string;
  hasta: string;
  orden: "reciente" | "antigua";
  limite: number;
};

export function parseFiltros(raw: unknown): FiltrosBusqueda {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const casitas = Array.isArray(input.casitas)
    ? [...new Set(input.casitas.map((value) => entero(value, 1, 99)).filter((value): value is number => value !== null))].slice(0, 40)
    : [];
  const cantidades = Array.isArray(input.cantidades)
    ? input.cantidades.flatMap((item) => {
      const { articulo, comparacion, cantidad } = (item ?? {}) as Record<string, unknown>;
      const n = entero(cantidad, 0, MAX_CANTIDAD);
      if (typeof articulo !== "string" || !(articulo in ARTICULOS_CANTIDAD)) return [];
      if (!COMPARACIONES.includes(comparacion as Comparacion) || n === null) return [];
      return [{ articulo: articulo as ArticuloCantidad, comparacion: comparacion as Comparacion, cantidad: n }];
    }).slice(0, 6)
    : [];
  const presencia = Array.isArray(input.presencia)
    ? input.presencia.flatMap((item) => {
      const { articulo, hay } = (item ?? {}) as Record<string, unknown>;
      if (typeof articulo !== "string" || !(articulo in ARTICULOS_SI_NO) || typeof hay !== "boolean") return [];
      return [{ articulo: articulo as ArticuloSiNo, hay }];
    }).slice(0, 6)
    : [];
  const estado = CAJA_FUERTE_FILTERS.find((value) => value === input.estado_caja_fuerte) ?? null;
  return {
    casitas,
    cantidades,
    presencia,
    estado,
    conNota: typeof input.con_nota === "boolean" ? input.con_nota : null,
    conNotaExtra: typeof input.con_nota_extra === "boolean" ? input.con_nota_extra : null,
    quien: limpiarTexto(input.quien_revisa, 40),
    texto: limpiarTexto(input.texto),
    desde: parseArchiveDate(input.desde),
    hasta: parseArchiveDate(input.hasta),
    orden: input.orden === "antigua" ? "antigua" : "reciente",
    limite: entero(input.limite, 1, MAX_LIMITE) ?? 10,
  };
}

export async function buscarRevisiones(client: Client, filtros: FiltrosBusqueda) {
  let request = client
    .from(REVISIONES_TABLE)
    .select(INICIO_REVISION_COLUMNS, { count: "exact" })
    .eq("pendiente", false)
    .order("created_at", { ascending: filtros.orden === "antigua", nullsFirst: false })
    .order("id", { ascending: filtros.orden === "antigua" })
    .limit(filtros.limite);

  if (filtros.casitas.length) request = request.in("casita", filtros.casitas.flatMap(variantes));
  for (const { articulo, comparacion, cantidad } of filtros.cantidades) {
    request = request.in(articulo, valoresQueCumplen(comparacion, cantidad));
  }
  for (const { articulo, hay } of filtros.presencia) {
    request = hay
      ? request.or(`${articulo}.ilike.si,${articulo}.in.(${valoresQueCumplen(">", 0).join(",")})`)
      : request.or(`${articulo}.ilike.no,${articulo}.in.(0,00)`);
  }
  if (filtros.estado) request = request.eq("caja_fuerte", filtros.estado);
  for (const [campo, valor] of [["notas", filtros.conNota], ["nota_extra", filtros.conNotaExtra]] as const) {
    if (valor === true) request = request.not(campo, "is", null).neq(campo, "");
    if (valor === false) request = request.or(`${campo}.is.null,${campo}.eq.`);
  }
  if (filtros.quien) request = request.ilike("quien_revisa", `%${filtros.quien}%`);
  if (filtros.texto) {
    const patron = `%${filtros.texto}%`;
    request = request.or(["notas", "nota_extra", "faltantes", "puertas_ventanas"].map((campo) => `${campo}.ilike.${patron}`).join(","));
  }
  if (filtros.desde) request = request.gte("created_at", `${filtros.desde} 00:00:00`);
  if (filtros.hasta) request = request.lt("created_at", `${shiftDay(filtros.hasta, 1)} 00:00:00`);

  const { data, error, count } = await request;
  if (error) throw new Error(error.message);
  return { total: count ?? 0, rows: ((data ?? []) as RevisionCasitaInicio[]).map(mapInicioRevision) };
}

function corto(valor: string | null | undefined, max = 120) {
  return valor && valor.length > max ? `${valor.slice(0, max)}…` : valor;
}

export function resumenParaModelo(total: number, rows: InicioRevisionRow[]) {
  return JSON.stringify({
    total,
    revisiones: rows.map((row) => ({
      ref: row.id,
      fecha: row.created_at,
      casita: row.casita,
      quien_revisa: row.quien_revisa,
      caja_fuerte: row.caja_fuerte,
      ...Object.fromEntries(Object.keys(ARTICULOS_CANTIDAD).map((key) => [key, row[key as ArticuloCantidad]])),
      ...Object.fromEntries(Object.keys(ARTICULOS_SI_NO).map((key) => [key, row[key as ArticuloSiNo]])),
      puertas_ventanas: corto(row.puertas_ventanas, 60),
      notas: corto(row.notas, 300),
      nota_extra: corto(row.nota_extra, 300),
    })),
  });
}
