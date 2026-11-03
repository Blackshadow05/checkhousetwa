import { costaRicaDateTime } from "@/lib/revision-form";
import { shiftDay } from "@/lib/revisiones-archive";

export type OperacionMemo = {
  casita: string;
  llegada_fecha: string | null;
  salida_fecha: string | null;
  tipo: string | null;
  fecha_memo: string | null;
};

function diaIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const dia = valor.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

export function mapOperacionMemo(row: {
  casita: string | null;
  llegada_fecha: string | null;
  salida_fecha: string | null;
  tipo?: string | null;
  fecha_memo?: string | null;
}): OperacionMemo | null {
  const casita = row.casita?.trim() ?? "";
  if (!casita) return null;
  return {
    casita,
    llegada_fecha: diaIso(row.llegada_fecha),
    salida_fecha: diaIso(row.salida_fecha),
    tipo: row.tipo?.trim() || null,
    fecha_memo: diaIso(row.fecha_memo),
  };
}

export function esOperacionMemo(value: unknown): value is OperacionMemo {
  if (!value || typeof value !== "object") return false;
  const row = value as {
    casita?: unknown;
    llegada_fecha?: unknown;
    salida_fecha?: unknown;
    tipo?: unknown;
    fecha_memo?: unknown;
  };
  return typeof row.casita === "string"
    && (row.llegada_fecha === null || typeof row.llegada_fecha === "string")
    && (row.salida_fecha === null || typeof row.salida_fecha === "string")
    && (row.tipo === undefined || row.tipo === null || typeof row.tipo === "string")
    && (row.fecha_memo === undefined || row.fecha_memo === null || typeof row.fecha_memo === "string");
}

function filasMemoDelDia(filas: readonly OperacionMemo[], hoy: string) {
  const conFechaMemo = filas.some((fila) => fila.fecha_memo);
  if (!conFechaMemo) return filas;
  return filas.filter((fila) => fila.fecha_memo === hoy);
}

export function casitasConLlegada(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  const manana = shiftDay(hoy, 1);
  const casitas = new Set<string>();
  for (const fila of filasMemoDelDia(filas, hoy)) {
    if (fila.llegada_fecha !== hoy && fila.llegada_fecha !== manana) continue;
    const numero = numeroCasita(fila.casita);
    if (numero) casitas.add(numero);
  }
  return casitas;
}

function numeroCasita(casita: string) {
  const numero = Number(casita.trim());
  if (!Number.isInteger(numero) || numero < 1) return null;
  return String(numero);
}

function tipoMemo(tipo: string | null | undefined) {
  return (tipo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´’]/g, "'")
    .toLowerCase()
    .trim();
}

// In house Guests listados en el memo del día (fecha_memo).
export function casitasInHouseGuestsDelDia(filas: readonly OperacionMemo[], hoy: string): Set<string> | null {
  if (!filas.some((fila) => fila.tipo?.trim())) return null;
  const casitas = new Set<string>();
  for (const fila of filasMemoDelDia(filas, hoy)) {
    if (tipoMemo(fila.tipo) !== "in house guests") continue;
    const numero = numeroCasita(fila.casita);
    if (numero) casitas.add(numero);
  }
  return casitas;
}

// Huésped en casa hoy: In house Guests del memo del día, ya llegó y sale después de hoy.
// null cuando el memo guardado no trae tipo: no alcanza para decidir ocupación.
export function casitasEnCasa(filas: readonly OperacionMemo[], hoy: string): Set<string> | null {
  if (!filas.some((fila) => fila.tipo?.trim())) return null;
  const casitas = new Set<string>();
  for (const fila of filasMemoDelDia(filas, hoy)) {
    if (tipoMemo(fila.tipo) !== "in house guests") continue;
    if (!fila.llegada_fecha || fila.llegada_fecha > hoy) continue;
    if (!fila.salida_fecha || fila.salida_fecha <= hoy) continue;
    const numero = numeroCasita(fila.casita);
    if (numero) casitas.add(numero);
  }
  return casitas;
}

// La salida de hoy tiene prioridad: una casita no puede quedar en Check in y Check out a la vez.
export function cajaFuertePorMemo(
  filas: readonly OperacionMemo[],
  casita: string,
  ahora = new Date(),
): "" | "Check in" | "Check out" {
  const numero = Number(casita);
  if (!casita.trim() || !Number.isInteger(numero) || numero < 1) return "";
  const propias = filas.filter((fila) => Number(fila.casita) === numero);
  if (!propias.length) return "";
  const hoy = costaRicaDateTime(ahora).slice(0, 10);
  const manana = shiftDay(hoy, 1);
  if (propias.some((fila) => fila.salida_fecha === hoy)) return "Check out";
  if (propias.some((fila) => fila.llegada_fecha === hoy || fila.llegada_fecha === manana)) return "Check in";
  return "";
}
