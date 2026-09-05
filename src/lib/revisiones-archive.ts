import { normalizeText, revisionDay } from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

export const ARCHIVE_PAGE_SIZE = 30;

export type ArchivePeriod = "all" | "today" | "week";

export type ArchiveQuery = {
  search: string;
  period: ArchivePeriod;
  status: string | null;
  offset: number;
  limit: number;
  today: string;
};

export const CAJA_FUERTE_FILTERS = [
  "Check in",
  "Check out",
  "Upsell",
  "Guardar Upsell",
  "Back to Back",
  "Room Move",
  "Show Room",
  "Si",
  "No",
] as const;

export function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

export function sanitizeArchiveSearch(raw: string) {
  return raw.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export function isCasitaNumberQuery(value: string) {
  return /^\d+$/.test(value);
}

export function archiveSearchOrFilter(raw: string) {
  const cleaned = sanitizeArchiveSearch(raw);
  if (!cleaned) return null;
  const escaped = cleaned
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  if (isCasitaNumberQuery(cleaned)) {
    return `casita.eq.${cleaned},quien_revisa.ilike.%${escaped}%`;
  }
  return `casita.ilike.%${escaped}%,quien_revisa.ilike.%${escaped}%`;
}

export function matchesArchiveSearch(row: InicioRevisionRow, raw: string) {
  const cleaned = sanitizeArchiveSearch(raw);
  if (!cleaned) return true;
  const query = normalizeText(cleaned);
  const casita = normalizeText(row.casita);
  const reviewer = normalizeText(row.quien_revisa);
  if (isCasitaNumberQuery(cleaned)) {
    return casita === query || reviewer.includes(query);
  }
  return casita.includes(query) || reviewer.includes(query);
}

export function matchesArchivePeriod(
  row: InicioRevisionRow,
  period: ArchivePeriod,
  today: string,
) {
  if (period === "all") return true;
  const day = revisionDay(row.created_at);
  if (period === "today") return day === today;
  if (day === "sin-fecha") return false;
  const weekStart = shiftDay(today, -6);
  return day >= weekStart && day <= today;
}

export function filterArchiveLocally(
  rows: InicioRevisionRow[],
  search: string,
  period: ArchivePeriod,
  status: string | null,
  today: string,
) {
  return rows.filter((row) => {
    if (status !== null && row.caja_fuerte !== status) return false;
    if (!matchesArchivePeriod(row, period, today)) return false;
    return matchesArchiveSearch(row, search);
  });
}

export function parseArchivePeriod(value: string): ArchivePeriod {
  if (value === "today" || value === "week") return value;
  return "all";
}
