import consejos from "@/data/consejos-diarios.json";

export type ConsejoDiario = { id: number; categoria: string; consejo: string };
export const CONSEJOS_DIARIOS: readonly ConsejoDiario[] = consejos;
const DAY_MS = 86_400_000;

export function consejoDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function nextConsejoDayDelay(now = new Date()) {
  const midnight = Date.parse(`${consejoDay(now)}T00:00:00-06:00`);
  return midnight + DAY_MS - now.getTime() + 50;
}

function shuffled(catalog: readonly ConsejoDiario[], cycle: number) {
  const result = [...catalog].sort((a, b) => a.id - b.id);
  // A seeded Fisher-Yates shuffle is identical on server, browser and offline.
  let state = (cycle ^ 0x6d2b79f5) >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const pick = Math.floor((state / 0x100000000) * (index + 1));
    [result[index], result[pick]] = [result[pick], result[index]];
  }
  return result;
}

export function consejoForDay(day: string, catalog: readonly ConsejoDiario[] = CONSEJOS_DIARIOS): ConsejoDiario {
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) {
    throw new Error("Fecha de consejo inválida");
  }
  const available = catalog.length ? catalog : CONSEJOS_DIARIOS;
  const ordinal = Math.floor(timestamp / DAY_MS);
  const cycle = Math.floor(ordinal / available.length);
  const index = ((ordinal % available.length) + available.length) % available.length;
  // For tiny catalogs use a fixed alternating order; for the full catalog each
  // cycle gets a new shuffle and its first tip differs from the previous last.
  const order = shuffled(available, available.length <= 2 ? 0 : cycle);
  if (available.length > 2 && order[0].id === shuffled(available, cycle - 1).at(-1)?.id) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order[index];
}
