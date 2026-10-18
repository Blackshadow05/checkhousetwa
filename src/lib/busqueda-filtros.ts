import { fechaTexto } from "@/lib/fechas";
import { CASITAS } from "@/lib/pantallas";
import { shiftDay } from "@/lib/revisiones-archive";

// Compartido entre servidor y cliente (sin "server-only"): catálogos, periodos y chips de la búsqueda inteligente.

// Casitas del hotel, numeradas del 1 al TOTAL_CASITAS (las mismas que CASITAS de pantallas).
export const TOTAL_CASITAS = CASITAS.length;

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

export type ArticuloCantidad = keyof typeof ARTICULOS_CANTIDAD;
export type ArticuloSiNo = keyof typeof ARTICULOS_SI_NO;
export type Comparacion = "=" | "!=" | "<" | "<=" | ">" | ">=";

export const COMPARACIONES: Comparacion[] = ["=", "!=", "<", "<=", ">", ">="];

// Filtros tal como viajan entre la ruta, el cliente y la server action (mismas claves que la herramienta).
// El servidor siempre los revalida con parseFiltros.
export type FiltrosSerializados = {
  casitas?: number[];
  cantidades?: { articulo: ArticuloCantidad; comparacion: Comparacion; cantidad: number }[];
  presencia?: { articulo: ArticuloSiNo; hay: boolean }[];
  estado_caja_fuerte?: string;
  quien_revisa?: string;
  texto?: string;
  // Revisiones elegidas por el modelo al leer las notas (buscar_por_significado).
  ids?: string[];
  con_nota?: boolean;
  con_nota_extra?: boolean;
  periodo?: string;
  desde?: string;
  hasta?: string;
  orden?: "reciente" | "antigua";
  limite?: number;
};

const PERIODOS_FIJOS = {
  hoy: "Hoy",
  ayer: "Ayer",
  esta_semana: "Esta semana",
  semana_pasada: "Semana pasada",
  este_mes: "Este mes",
  mes_pasado: "Mes pasado",
  este_anio: "Este año",
  anio_pasado: "Año pasado",
} as const;

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ULTIMOS = /^ultimos_([1-9]\d{0,2})_dias$/;
const MES = /^mes_(\d{4})_(0[1-9]|1[0-2])$/;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function periodoValido(valor: unknown) {
  if (typeof valor !== "string") return "";
  if (valor in PERIODOS_FIJOS) return valor;
  const ultimos = ULTIMOS.exec(valor);
  if (ultimos) return Number(ultimos[1]) <= 365 ? valor : "";
  const mes = MES.exec(valor);
  return mes && Number(mes[1]) >= 2000 && Number(mes[1]) <= 2100 ? valor : "";
}

function finDeMes(anio: number, mes: number) {
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
  return shiftDay(siguiente, -1);
}

// Convierte un periodo relativo a fechas YYYY-MM-DD (ambas incluidas). Semana de lunes a domingo.
export function resolverPeriodo(periodo: string, hoy: string): { desde: string; hasta: string } | null {
  const dia = DIA.exec(hoy);
  if (!dia || !periodoValido(periodo)) return null;
  const anio = Number(dia[1]);
  const inicioMes = `${dia[1]}-${dia[2]}-01`;
  const lunes = shiftDay(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7));
  switch (periodo) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "ayer": return { desde: shiftDay(hoy, -1), hasta: shiftDay(hoy, -1) };
    case "esta_semana": return { desde: lunes, hasta: hoy };
    case "semana_pasada": return { desde: shiftDay(lunes, -7), hasta: shiftDay(lunes, -1) };
    case "este_mes": return { desde: inicioMes, hasta: hoy };
    case "mes_pasado": {
      const hasta = shiftDay(inicioMes, -1);
      return { desde: `${hasta.slice(0, 7)}-01`, hasta };
    }
    case "este_anio": return { desde: `${anio}-01-01`, hasta: hoy };
    case "anio_pasado": return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };
  }
  const ultimos = ULTIMOS.exec(periodo);
  if (ultimos) return { desde: shiftDay(hoy, -(Number(ultimos[1]) - 1)), hasta: hoy };
  const mes = MES.exec(periodo);
  if (!mes) return null;
  return { desde: `${mes[1]}-${mes[2]}-01`, hasta: finDeMes(Number(mes[1]), Number(mes[2])) };
}

export function etiquetaPeriodo(periodo: string) {
  if (periodo in PERIODOS_FIJOS) return PERIODOS_FIJOS[periodo as keyof typeof PERIODOS_FIJOS];
  const ultimos = ULTIMOS.exec(periodo);
  if (ultimos) return ultimos[1] === "1" ? "Último día" : `Últimos ${ultimos[1]} días`;
  const mes = MES.exec(periodo);
  return mes ? `${capital(MESES[Number(mes[2]) - 1])} ${mes[1]}` : "";
}

function capital(texto: string) {
  return texto.charAt(0).toLocaleUpperCase("es-CR") + texto.slice(1);
}

function diaCorto(dia: string, conAnio: boolean) {
  const [anio, mes, d] = dia.split("-");
  return `${Number(d)} ${MESES[Number(mes) - 1].slice(0, 3)}${conAnio ? ` ${anio}` : ""}`;
}

export function etiquetaFechas(desde?: string, hasta?: string) {
  const conAnio = Boolean(desde && hasta && desde.slice(0, 4) !== hasta.slice(0, 4));
  if (desde && hasta) {
    if (desde === hasta) return diaCorto(desde, false);
    if (desde.slice(0, 7) === hasta.slice(0, 7)) return `${Number(desde.slice(8))}–${diaCorto(hasta, false)}`;
    return `${diaCorto(desde, conAnio)} – ${diaCorto(hasta, conAnio)}`;
  }
  if (desde) return `Desde ${diaCorto(desde, false)}`;
  return hasta ? `Hasta ${diaCorto(hasta, false)}` : "";
}

// Frase para las respuestas por plantilla: "de la semana pasada", "del 1 al 7 de octubre".
export function fraseFechas(filtros: FiltrosSerializados) {
  const periodo = filtros.periodo ?? "";
  const fijas: Record<string, string> = {
    hoy: "de hoy", ayer: "de ayer", esta_semana: "de esta semana", semana_pasada: "de la semana pasada",
    este_mes: "de este mes", mes_pasado: "del mes pasado", este_anio: "de este año", anio_pasado: "del año pasado",
  };
  if (fijas[periodo]) return fijas[periodo];
  const ultimos = ULTIMOS.exec(periodo);
  if (ultimos) return ultimos[1] === "1" ? "del último día" : `de los últimos ${ultimos[1]} días`;
  const mes = MES.exec(periodo);
  if (mes) return `de ${MESES[Number(mes[2]) - 1]} de ${mes[1]}`;
  const { desde, hasta } = filtros;
  const largo = (dia: string) => fechaTexto(dia, false).toLocaleLowerCase("es-CR");
  if (desde && hasta) {
    if (desde === hasta) return `del ${largo(desde)}`;
    if (desde.slice(0, 7) === hasta.slice(0, 7)) return `del ${Number(desde.slice(8))} al ${largo(hasta)}`;
    return `del ${largo(desde)} al ${largo(hasta)}`;
  }
  if (desde) return `desde el ${largo(desde)}`;
  return hasta ? `hasta el ${largo(hasta)}` : "";
}

export type ChipFiltro = { id: string; etiqueta: string };

const SIMBOLOS: Record<Comparacion, string> = { "=": "=", "!=": "≠", "<": "<", "<=": "≤", ">": ">", ">=": "≥" };

function minuscula(texto: string) {
  return texto.charAt(0).toLocaleLowerCase("es-CR") + texto.slice(1);
}

export function chipsDeFiltros(filtros: FiltrosSerializados | null | undefined): ChipFiltro[] {
  if (!filtros) return [];
  const chips: ChipFiltro[] = [];
  for (const casita of filtros.casitas ?? []) chips.push({ id: `casita:${casita}`, etiqueta: `Casita ${casita}` });
  if (filtros.quien_revisa) chips.push({ id: "quien", etiqueta: filtros.quien_revisa });
  const fechas = (filtros.periodo && etiquetaPeriodo(filtros.periodo)) || etiquetaFechas(filtros.desde, filtros.hasta);
  if (fechas) chips.push({ id: "fechas", etiqueta: fechas });
  for (const { articulo, comparacion, cantidad } of filtros.cantidades ?? []) {
    chips.push({ id: `cantidad:${articulo}${comparacion}${cantidad}`, etiqueta: `${ARTICULOS_CANTIDAD[articulo] ?? articulo} ${SIMBOLOS[comparacion] ?? comparacion} ${cantidad}` });
  }
  for (const { articulo, hay } of filtros.presencia ?? []) {
    chips.push({ id: `presencia:${articulo}`, etiqueta: `${hay ? "Con" : "Sin"} ${minuscula(ARTICULOS_SI_NO[articulo] ?? articulo)}` });
  }
  if (filtros.estado_caja_fuerte) chips.push({ id: "estado", etiqueta: `Caja: ${filtros.estado_caja_fuerte}` });
  if (filtros.texto) chips.push({ id: "texto", etiqueta: `Texto: ${filtros.texto}` });
  if (filtros.ids) chips.push({ id: "ids", etiqueta: `Coincidencias por significado: ${filtros.ids.length}` });
  if (typeof filtros.con_nota === "boolean") chips.push({ id: "con_nota", etiqueta: filtros.con_nota ? "Con nota" : "Sin nota" });
  if (typeof filtros.con_nota_extra === "boolean") {
    chips.push({ id: "con_nota_extra", etiqueta: filtros.con_nota_extra ? "Con nota extra" : "Sin nota extra" });
  }
  if (filtros.orden === "antigua") chips.push({ id: "orden", etiqueta: "Más antiguas" });
  return chips;
}

export function quitarFiltro(filtros: FiltrosSerializados, id: string): FiltrosSerializados {
  const nuevos = { ...filtros };
  const [tipo, valor] = id.split(":");
  switch (tipo) {
    case "casita": nuevos.casitas = (filtros.casitas ?? []).filter((casita) => String(casita) !== valor); break;
    case "quien": delete nuevos.quien_revisa; break;
    case "fechas": delete nuevos.periodo; delete nuevos.desde; delete nuevos.hasta; break;
    case "cantidad": nuevos.cantidades = (filtros.cantidades ?? []).filter((item) => `${item.articulo}${item.comparacion}${item.cantidad}` !== valor); break;
    case "presencia": nuevos.presencia = (filtros.presencia ?? []).filter((item) => item.articulo !== valor); break;
    case "estado": delete nuevos.estado_caja_fuerte; break;
    case "texto": delete nuevos.texto; break;
    case "ids": delete nuevos.ids; break;
    case "con_nota": delete nuevos.con_nota; break;
    case "con_nota_extra": delete nuevos.con_nota_extra; break;
    case "orden": nuevos.orden = "reciente"; break;
  }
  return nuevos;
}
