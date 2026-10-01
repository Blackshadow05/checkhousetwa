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

export function resumenExtras(rows: HorarioRow[], empleado: string, from: string, to: string, today: string) {
  const days = rows.filter(row => row.empleado === empleado && row.fecha >= from && row.fecha <= to && row.fecha <= today);
  const detail = days.map(row => ({ ...row, ...clasificarTurno(row) }));
  return {
    mixtas: detail.reduce((sum, row) => sum + row.extrasMixtas, 0),
    nocturnas: detail.reduce((sum, row) => sum + row.extrasNocturnas, 0),
    days: detail.filter(row => row.extrasMixtas || row.extrasNocturnas).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    pendientes: detail.filter(row => row.jornada === "sin-clasificar"),
  };
}
