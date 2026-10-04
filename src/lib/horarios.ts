export type HorarioRow = {
  id: string;
  empleado: string;
  fecha: string;
  turno: string | null;
  es_especial: boolean | null;
};

export type HorariosSnapshot = {
  ownerId: number;
  rows: HorarioRow[];
  updatedAt: string;
};

export const JORNADAS = [
  { id: "diurno", label: "Diurno" },
  { id: "mixto", label: "Mixto" },
  { id: "nocturno", label: "Nocturno" },
  { id: "partido", label: "Jornada partida" },
  { id: "otros", label: "Otros" },
] as const;
export type Jornada = typeof JORNADAS[number]["id"] | "sin-clasificar";
export type TipoAusencia = "libre" | "vacaciones" | "incapacidad" | "feriado";
export type TurnoClasificado = {
  jornada: Jornada;
  label: string;
  horario: string;
  extrasMixtas: number;
  extrasNocturnas: number;
  ausencia: TipoAusencia | null;
};

export function normalizarEmpleado(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[.]/g, "").trim().replace(/\s+/g, " ");
}

const EMPLEADOS_POR_USUARIO: Record<string, string> = {
  "adrian s": "adrian solis",
  "cristhofer g": "cristofer gamboa",
  "daniel v": "daniel vega",
  "esteban b": "esteban bonilla",
  "jefferson v": "jefferson vargas",
  "juan m": "juan mora",
  "magaly": "magaly badilla",
  "michael j": "michael jimenez",
  "olman z": "olman zuniga",
  "ricardo b": "ricardo bonilla",
  "willy g": "willy garro",
};

export function esEmpleadoDeUsuario(empleado: string, usuario: string): boolean {
  const nombre = normalizarEmpleado(usuario);
  const objetivo = EMPLEADOS_POR_USUARIO[nombre] || nombre;
  const actual = normalizarEmpleado(empleado);
  return actual === objetivo || actual === nombre;
}

function hora(value: string): number | null {
  if (/^(?:00|0|12)mn$/.test(value)) return 0;
  if (value === "12md") return 12;
  const twelve = /^(\d{1,2})(am|pm)$/.exec(value);
  if (twelve) {
    const number = Number(twelve[1]);
    if (number < 1 || number > 12) return null;
    return number % 12 + (twelve[2] === "pm" ? 12 : 0);
  }
  const twentyFour = /^(\d{1,2}):00$/.exec(value);
  return twentyFour && Number(twentyFour[1]) < 24 ? Number(twentyFour[1]) : null;
}

// Only the rules confirmed for this app count extras. es_especial is not an
// overtime override: the same shift has the same rule with either flag value.
export function clasificarTurno(row: Pick<HorarioRow, "empleado" | "turno">): TurnoClasificado {
  const raw = row.turno?.trim() || "Sin turno registrado";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  const base = { horario: raw, extrasMixtas: 0, extrasNocturnas: 0, ausencia: null };
  let ausencia: TipoAusencia | null = null;
  if (normalized === "l" || normalized === "libre" || normalized === "dia libre" || normalized.startsWith("l ")) ausencia = "libre";
  else if (/^vacaciones(?:\s|$)/.test(normalized)) ausencia = "vacaciones";
  else if (/^incapacidad(?:\s|$)/.test(normalized)) ausencia = "incapacidad";
  else if (/^feriado(?:\s|$)/.test(normalized)) ausencia = "feriado";
  if (ausencia) return { ...base, jornada: "otros", label: { libre: "L · Día libre", vacaciones: "Vacaciones", incapacidad: "Incapacidad", feriado: "Feriado" }[ausencia], ausencia };

  const parts = normalized.replace(/\s/g, "").split("/");
  const start = parts.length === 2 ? hora(parts[0]) : null;
  const end = parts.length === 2 ? hora(parts[1]) : null;
  const key = `${start}/${end}`;
  const ramiro = normalizarEmpleado(row.empleado) === "ramiro quesada";
  if (["6/14", "7/15"].includes(key) || key === "6/17" && ramiro) return { ...base, jornada: "diurno", label: "Diurno" };
  if (key === "14/22") return { ...base, jornada: "mixto", label: "Mixto", extrasMixtas: 1 };
  if (key === "15/22") return { ...base, jornada: "mixto", label: "Mixto" };
  if (key === "22/6") return { ...base, jornada: "nocturno", label: "Nocturno", extrasNocturnas: 2 };
  if (["0/6", "22/4"].includes(key)) return { ...base, jornada: "nocturno", label: "Nocturno" };
  if (["8/17", "8/16", "7/16"].includes(key) || key === "8/19" && ramiro) return { ...base, jornada: "partido", label: "Jornada partida" };
  return { ...base, jornada: "sin-clasificar", label: "Sin regla definida" };
}

export function fechaCostaRica(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function fechaHorario(value: string, long = false): string {
  // Date-only columns are calendar days, never timestamps in the device zone.
  return new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", day: "numeric", month: long ? "long" : "short", ...(long ? { weekday: "long" as const, year: "numeric" as const } : {}) }).format(new Date(`${value}T12:00:00Z`));
}

export function fechaValida(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function resumenAusencias(rows: HorarioRow[], empleado: string, tipo: TipoAusencia, today: string) {
  const years = new Map<string, HorarioRow[]>();
  for (const row of rows) {
    if (row.empleado !== empleado || row.fecha > today || clasificarTurno(row).ausencia !== tipo) continue;
    const year = row.fecha.slice(0, 4);
    const group = years.get(year) || [];
    group.push(row); years.set(year, group);
  }
  return Array.from(years, ([year, days]) => ({ year, days: days.sort((a, b) => a.fecha.localeCompare(b.fecha)), total: new Set(days.map(row => row.fecha)).size })).sort((a, b) => b.year.localeCompare(a.year));
}

export const HORA_ORDINARIA_CENTIMOS = { mixta: 193196, nocturna: 225395 } as const;
const RECARGO_EXTRA = 1.5;
const RECARGO_EXTRA_FERIADO = 3;
const CCSS_PUNTOS_BASE = 1083;
export const CCSS_PORCENTAJE = `${(CCSS_PUNTOS_BASE / 100).toFixed(2)} %`;
const FERIADOS_FIJOS = ["01-01", "04-11", "05-01", "07-25", "08-15", "08-31", "09-15", "12-01", "12-25"];
const FORMATO_COLONES = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function colones(centimos: number): string {
  return `₡${FORMATO_COLONES.format(centimos / 100)}`;
}

export function sumarDias(fecha: string, dias: number): string {
  const date = new Date(`${fecha}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

function domingoPascua(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function esFeriado(fecha: string): boolean {
  if (FERIADOS_FIJOS.includes(fecha.slice(5))) return true;
  const pascua = domingoPascua(Number(fecha.slice(0, 4)));
  return fecha === sumarDias(pascua, -3) || fecha === sumarDias(pascua, -2);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

export function netoCcss(centimos: number): number {
  return Math.round(centimos * (10000 - CCSS_PUNTOS_BASE) / 10000);
}

export const QUINCENA_CENTIMOS = { salario: 20285550, especie: 2015000 } as const;

export function pagoConQuincena(brutoExtras: number) {
  const bruto = brutoExtras + QUINCENA_CENTIMOS.salario;
  return { bruto: Math.round(bruto), neto: netoCcss(bruto + QUINCENA_CENTIMOS.especie) - QUINCENA_CENTIMOS.especie };
}

export function resumenExtras(rows: HorarioRow[], empleado: string, from: string, to: string, today: string) {
  const days = rows.filter(row => row.empleado === empleado && row.fecha >= from && row.fecha <= to && row.fecha <= today);
  const detail = days.map(row => {
    const turno = clasificarTurno(row);
    const mixtaFeriado = turno.extrasMixtas > 0 && esFeriado(row.fecha);
    const nocturnaFeriado = turno.extrasNocturnas > 0 && esFeriado(sumarDias(row.fecha, 1));
    const montoMixtas = turno.extrasMixtas * HORA_ORDINARIA_CENTIMOS.mixta * (mixtaFeriado ? RECARGO_EXTRA_FERIADO : RECARGO_EXTRA);
    const montoNocturnas = turno.extrasNocturnas * HORA_ORDINARIA_CENTIMOS.nocturna * (nocturnaFeriado ? RECARGO_EXTRA_FERIADO : RECARGO_EXTRA);
    return { ...row, ...turno, mixtaFeriado, nocturnaFeriado, montoMixtas, montoNocturnas, monto: Math.round(montoMixtas + montoNocturnas) };
  });
  const exactoMixtas = detail.reduce((sum, row) => sum + row.montoMixtas, 0);
  const exactoNocturnas = detail.reduce((sum, row) => sum + row.montoNocturnas, 0);
  const montoMixtas = Math.round(exactoMixtas);
  const montoNocturnas = Math.round(exactoNocturnas);
  return {
    mixtas: detail.reduce((sum, row) => sum + row.extrasMixtas, 0),
    nocturnas: detail.reduce((sum, row) => sum + row.extrasNocturnas, 0),
    mixtasFeriado: detail.reduce((sum, row) => sum + (row.mixtaFeriado ? row.extrasMixtas : 0), 0),
    nocturnasFeriado: detail.reduce((sum, row) => sum + (row.nocturnaFeriado ? row.extrasNocturnas : 0), 0),
    montoMixtas,
    montoNocturnas,
    bruto: montoMixtas + montoNocturnas,
    brutoExacto: exactoMixtas + exactoNocturnas,
    neto: netoCcss(exactoMixtas + exactoNocturnas),
    days: detail.filter(row => row.extrasMixtas || row.extrasNocturnas).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    pendientes: detail.filter(row => row.jornada === "sin-clasificar"),
  };
}
