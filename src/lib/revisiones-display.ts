import type { InicioRevisionRow } from "@/types/database";

export const INICIO_REVISION_COLUMNS =
  "id, casita, quien_revisa, caja_fuerte, created_at, puertas_ventanas, chromecast, binoculares, trapo_binoculares, speaker, usb_speaker, controles_tv, secadora, accesorios_secadora, steamer, bolsa_vapor, plancha_cabello, bulto, sombrero, bolso_yute, evidencia_01, evidencia_02, evidencia_03, camas_ordenadas, cola_caballo, notas, nota_extra, room_move, registro_reconocimiento, pendiente, marcada_por, marcada_at" as const;

export const INICIO_LIST_LIMIT = 100;

export const ELECTRONIC_FIELDS = [
  { key: "chromecast", label: "Chromecast" },
  { key: "speaker", label: "Speaker" },
  { key: "usb_speaker", label: "USB speaker" },
  { key: "controles_tv", label: "Controles TV" },
] as const;

export const EQUIPMENT_FIELDS = [
  { key: "secadora", label: "Secadora" },
  { key: "accesorios_secadora", label: "Accesorios secadora" },
  { key: "steamer", label: "Steamer" },
  { key: "bolsa_vapor", label: "Bolsa vapor" },
  { key: "plancha_cabello", label: "Plancha de cabello" },
  { key: "binoculares", label: "Binoculares" },
  { key: "trapo_binoculares", label: "Trapo de binoculares" },
  { key: "cola_caballo", label: "Cola de caballo" },
  { key: "bolso_yute", label: "Bolso de yute" },
  { key: "bulto", label: "Bulto" },
  { key: "sombrero", label: "Sombrero" },
  { key: "camas_ordenadas", label: "Camas ordenadas" },
] as const;

const PUERTAS_OK = new Set([
  "ok",
  "okay",
  "si",
  "sí",
  "bien",
  "todo bien",
  "correcto",
  "cerradas",
  "cerrado",
]);

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isUpsellStatus(value: string) {
  return normalizeText(value) === "upsell";
}

export function statusAppearance(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "check in" || normalized === "check inn")
    return { tone: "sage", label: "Check in" };
  if (normalized === "check out") return { tone: "rose", label: "Check out" };
  if (isUpsellStatus(value)) return { tone: "blue", label: "Upsell" };
  if (normalized === "guardar upsell")
    return { tone: "plum", label: "Guardar Upsell" };
    if (normalized === "back to back")
      return { tone: "amber", label: "Back to Back" };
  if (normalized === "room move") return { tone: "amber", label: "Room Move" };
  if (normalized === "si" || normalized === "sí")
    return { tone: "amber", label: "Sí" };
  if (normalized === "no") return { tone: "amber", label: "No" };
  return {
    tone: "amber",
    label: value === "—" || !value ? "Sin registro" : value,
  };
}

export const HOY_BOARD_GROUPS = [
  { id: "check_in", label: "Check in", tone: "sage" },
  { id: "upsell", label: "Upsell", tone: "blue" },
  { id: "back_to_back", label: "Back to back", tone: "amber" },
  { id: "room_move", label: "Room Move", tone: "plum" },
  { id: "check_out", label: "Check out", tone: "rose" },
] as const;

export type HoyBoardGroupId = (typeof HOY_BOARD_GROUPS)[number]["id"];

export function hoyBoardGroup(value: string): HoyBoardGroupId | null {
  const normalized = normalizeText(value);
  if (normalized === "check in" || normalized === "check inn") return "check_in";
  if (isUpsellStatus(value)) return "upsell";
  if (normalized === "back to back") return "back_to_back";
  if (normalized === "room move") return "room_move";
  if (normalized === "check out") return "check_out";
  return null;
}

export function casitaNumber(value: string) {
  const match = value.match(/\d+/);
  return match?.[0] ?? value.trim();
}

function sortByCasita(rows: InicioRevisionRow[]) {
  return [...rows].sort((left, right) => {
    const a = Number.parseInt(casitaNumber(left.casita), 10);
    const b = Number.parseInt(casitaNumber(right.casita), 10);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return casitaNumber(left.casita).localeCompare(
        casitaNumber(right.casita),
        "es",
        { numeric: true },
      );
    }
    return a - b;
  });
}

function latestTodayByCasita(rows: InicioRevisionRow[], today: string) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (revisionDay(row.created_at) !== today) continue;
    const group = hoyBoardGroup(row.caja_fuerte);
    if (!group || group === "upsell") continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return latestByCasita;
}

export function latestUpsellsByCasita(rows: InicioRevisionRow[]) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (hoyBoardGroup(row.caja_fuerte) !== "upsell") continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return latestByCasita;
}

export function currentUpsellsFromRows(rows: InicioRevisionRow[]) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (row.pendiente) continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return [...latestByCasita.values()].filter(
    (row) => hoyBoardGroup(row.caja_fuerte) === "upsell",
  );
}

export function groupHoyCasitas(
  rows: InicioRevisionRow[],
  today: string,
  upsells: InicioRevisionRow[] = [],
) {
  const latestToday = latestTodayByCasita(rows, today);
  const latestUpsells = latestUpsellsByCasita(upsells);

  return HOY_BOARD_GROUPS.map((group) => ({
    ...group,
    rows: sortByCasita(
      group.id === "upsell"
        ? [...latestUpsells.values()]
        : [...latestToday.values()].filter(
            (row) => hoyBoardGroup(row.caja_fuerte) === group.id,
          ),
    ),
  })).filter((group) => group.rows.length > 0);
}

// The home query supplies the recorded wall-clock date as YYYY-MM-DD HH:mm.
// Parse it explicitly: Safari does not consistently parse SQL-style date strings.
export function revisionDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "sin-fecha";
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dayLabel(day: string, today: string) {
  if (day === "sin-fecha") return "Sin fecha";
  if (day === today) return "Hoy";
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = new Date(`${day}T12:00:00`);
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "long",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  }).format(date);
}

export function shortTime(value: string) {
  return value.match(/[T ](\d{2}:\d{2})/)?.[1] ?? "Sin hora";
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function revisionKey(row: InicioRevisionRow, index: number) {
  return row.id || `${row.casita}-${row.created_at}-${row.quien_revisa}-${index}`;
}

export function hasRevisionValue(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== "—");
}

export function revisionEvidence(row: InicioRevisionRow) {
  return [row.evidencia_01, row.evidencia_02, row.evidencia_03].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 5,
  );
}

export function puertasVentanasOk(value: string | null) {
  if (!value) return true;
  return PUERTAS_OK.has(normalizeText(value));
}
