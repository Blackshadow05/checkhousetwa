import { costaRicaDateTime } from "@/lib/revision-form";
import { shiftDay } from "@/lib/revisiones-archive";

export type OperacionMemo = {
  casita: string;
  llegada_fecha: string | null;
  salida_fecha: string | null;
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
}): OperacionMemo | null {
  const casita = row.casita?.trim() ?? "";
  if (!casita) return null;
  return {
    casita,
    llegada_fecha: diaIso(row.llegada_fecha),
    salida_fecha: diaIso(row.salida_fecha),
  };
}

export function esOperacionMemo(value: unknown): value is OperacionMemo {
  if (!value || typeof value !== "object") return false;
  const row = value as OperacionMemo;
  return typeof row.casita === "string"
    && (row.llegada_fecha === null || typeof row.llegada_fecha === "string")
    && (row.salida_fecha === null || typeof row.salida_fecha === "string");
}

export function casitasConLlegada(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  const manana = shiftDay(hoy, 1);
  const casitas = new Set<string>();
  for (const fila of filas) {
    if (fila.llegada_fecha !== hoy && fila.llegada_fecha !== manana) continue;
    const numero = Number(fila.casita);
    if (!Number.isInteger(numero) || numero < 1) continue;
    casitas.add(String(numero));
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
