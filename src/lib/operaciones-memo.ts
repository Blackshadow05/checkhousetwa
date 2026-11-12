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

function esTipoSalida(tipo: string | null | undefined) {
  const t = tipoMemo(tipo);
  if (!t) return false;
  if (t === "today's departure" || t === "tomorrow's departure") return true;
  if (t.includes("depart") || t.includes("salida")) return true;
  return false;
}

function cubreEstadiaHoy(fila: OperacionMemo, hoy: string) {
  if (!fila.llegada_fecha || !fila.salida_fecha) return false;
  if (fila.llegada_fecha > hoy) return false;
  if (fila.salida_fecha <= hoy) return false;
  if (esTipoSalida(fila.tipo)) return false;
  return true;
}

function memoDelDiaTieneInHouse(filas: readonly OperacionMemo[], hoy: string) {
  return filasMemoDelDia(filas, hoy).some((fila) => tipoMemo(fila.tipo) === "in house guests");
}

function memoDelDiaTieneSalidas(filas: readonly OperacionMemo[], hoy: string) {
  return filasMemoDelDia(filas, hoy).some(
    (fila) => esTipoSalida(fila.tipo) || fila.salida_fecha === hoy,
  );
}

// Si el memo de hoy no trae In house (aún no sube, o solo llegadas), usamos el
// último día anterior que sí tenga ocupación y proyectamos con llegada/salida.
function filasFuenteOcupacion(filas: readonly OperacionMemo[], hoy: string): readonly OperacionMemo[] {
  if (memoDelDiaTieneInHouse(filas, hoy)) return filasMemoDelDia(filas, hoy);
  const fechasPrevias = [
    ...new Set(
      filas
        .map((fila) => fila.fecha_memo)
        .filter((dia): dia is string => typeof dia === "string" && dia < hoy),
    ),
  ].sort();
  for (let i = fechasPrevias.length - 1; i >= 0; i -= 1) {
    const deDia = filas.filter((fila) => fila.fecha_memo === fechasPrevias[i]);
    if (deDia.some((fila) => tipoMemo(fila.tipo) === "in house guests")) return deDia;
  }
  return filas;
}

function tipoMemo(tipo: string | null | undefined) {
  return (tipo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´’]/g, "'")
    .toLowerCase()
    .trim();
}

// El memo real no tiene "Tomorrow's Arrivals": las llegadas de mañana
// están en el memo del día siguiente como "Today's Arrivals".
function esTipoLlegada(tipo: string | null | undefined) {
  const t = tipoMemo(tipo);
  if (!t) return false;
  if (t === "today's arrivals" || t === "tomorrow's arrivals" || t === "tomorrows arrivals") return true;
  if (t === "llegadas" || t === "llegadas de hoy" || t === "llegadas de manana") return true;
  return t.includes("arrival") && !t.includes("depart");
}

function cuentaComoLlegada(fila: OperacionMemo, hoy: string, llegada: string) {
  if (fila.llegada_fecha === llegada) {
    if (esTipoLlegada(fila.tipo)) return true;
    return fila.fecha_memo === hoy || fila.fecha_memo === llegada || !fila.fecha_memo;
  }
  return !fila.llegada_fecha && esTipoLlegada(fila.tipo) && fila.fecha_memo === llegada;
}

function casitasConLlegadaEn(filas: readonly OperacionMemo[], hoy: string, llegada: string): Set<string> {
  const casitas = new Set<string>();
  for (const fila of filas) {
    if (!cuentaComoLlegada(fila, hoy, llegada)) continue;
    const numero = numeroCasita(fila.casita);
    if (numero) casitas.add(numero);
  }
  return casitas;
}

export function casitasConLlegada(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  return new Set([
    ...casitasConLlegadaEn(filas, hoy, hoy),
    ...casitasConLlegadaEn(filas, hoy, shiftDay(hoy, 1)),
  ]);
}

// Solo llegadas con fecha de hoy (Today's Arrivals / ingresos del día).
export function casitasConLlegadaHoy(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  return casitasConLlegadaEn(filas, hoy, hoy);
}

// Llegadas de mañana: Today's Arrivals del memo de mañana, o llegada_fecha = mañana.
export function casitasConLlegadaManana(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  return casitasConLlegadaEn(filas, hoy, shiftDay(hoy, 1));
}

function filasFuenteSalidas(filas: readonly OperacionMemo[], hoy: string): readonly OperacionMemo[] {
  if (memoDelDiaTieneSalidas(filas, hoy)) return filasMemoDelDia(filas, hoy);
  return filasFuenteOcupacion(filas, hoy);
}

// Salidas del día: memo de hoy si ya trae departures; si no, proyectadas
// (salida_fecha = hoy) desde el último memo con ocupación.
export function casitasConSalidaHoy(filas: readonly OperacionMemo[], hoy: string): Set<string> {
  const casitas = new Set<string>();
  for (const fila of filasFuenteSalidas(filas, hoy)) {
    if (fila.salida_fecha !== hoy) continue;
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

export type EstadiaEnCasa = { llegada: string; salida: string };

function aportaOcupacionHoy(
  fila: OperacionMemo,
  hoy: string,
  memoHoyCompleto: boolean,
) {
  if (memoHoyCompleto) {
    if (tipoMemo(fila.tipo) !== "in house guests") return false;
    if (!fila.llegada_fecha || fila.llegada_fecha > hoy) return false;
    if (!fila.salida_fecha || fila.salida_fecha <= hoy) return false;
    return true;
  }
  if (!cubreEstadiaHoy(fila, hoy)) return false;
  if (tipoMemo(fila.tipo) === "in house guests") return true;
  // Llegada de un memo anterior que sigue en casa hoy. Las llegadas de hoy
  // se quedan en Check in de hoy, no en ocupación.
  return Boolean(fila.llegada_fecha && fila.llegada_fecha < hoy);
}

// In house de hoy, o proyectado desde el último memo con ocupación si el de
// hoy aún no sube / solo trae llegadas.
export function casitasInHouseGuestsDelDia(filas: readonly OperacionMemo[], hoy: string): Set<string> | null {
  const estadias = estadiasEnCasa(filas, hoy);
  return estadias ? new Set(estadias.keys()) : null;
}

// Huésped en casa hoy: In house del memo del día, o estadía proyectada
// (llegada ≤ hoy < salida) desde el último memo anterior con In house.
// null cuando el memo guardado no trae tipo: no alcanza para decidir ocupación.
export function estadiasEnCasa(
  filas: readonly OperacionMemo[],
  hoy: string,
): Map<string, EstadiaEnCasa> | null {
  if (!filas.some((fila) => fila.tipo?.trim())) return null;
  const memoHoyCompleto = memoDelDiaTieneInHouse(filas, hoy);
  const estadias = new Map<string, EstadiaEnCasa>();
  for (const fila of filasFuenteOcupacion(filas, hoy)) {
    if (!aportaOcupacionHoy(fila, hoy, memoHoyCompleto)) continue;
    const numero = numeroCasita(fila.casita);
    if (!numero || !fila.llegada_fecha || !fila.salida_fecha) continue;
    const actual = estadias.get(numero);
    if (!actual || fila.llegada_fecha > actual.llegada) {
      estadias.set(numero, { llegada: fila.llegada_fecha, salida: fila.salida_fecha });
    }
  }
  return estadias;
}

export function casitasEnCasa(filas: readonly OperacionMemo[], hoy: string): Set<string> | null {
  const estadias = estadiasEnCasa(filas, hoy);
  return estadias ? new Set(estadias.keys()) : null;
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
