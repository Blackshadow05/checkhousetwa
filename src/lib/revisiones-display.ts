import type { InicioRevisionRow } from "@/types/database";

export const INICIO_REVISION_COLUMNS =
  "id, casita, quien_revisa, caja_fuerte, created_at, puertas_ventanas, chromecast, binoculares, trapo_binoculares, speaker, usb_speaker, controles_tv, secadora, accesorios_secadora, steamer, bolsa_vapor, plancha_cabello, bulto, sombrero, bolso_yute, evidencia_01, evidencia_02, evidencia_03, camas_ordenadas, cola_caballo, notas, room_move" as const;

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

export function statusAppearance(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "check in") return { tone: "sage", label: value };
  if (normalized === "check out") return { tone: "blue", label: value };
  if (normalized.includes("upsell")) return { tone: "amber", label: value };
  if (normalized === "si" || normalized === "sí")
    return { tone: "sage", label: "Sí" };
  if (normalized === "no") return { tone: "rose", label: "No" };
  return {
    tone: "neutral",
    label: value === "—" || !value ? "Sin registro" : value,
  };
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
