import { casitaNumber, hasRevisionValue, normalizeText, revisionDay } from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

export const ARCHIVE_PAGE_SIZE = 30;

export type ArchivePeriod = "all" | "today" | "three-days" | "week";

export type ArchiveQuery = {
  search: string;
  period: ArchivePeriod;
  status: string | null;
  offset: number;
  limit: number;
  today: string;
  date?: string;
  reportFilter?: ReportFilter | null;
};

export const REPORT_FILTERS = [
  { id: "caja_fuerte", label: "Caja Fuerte" },
  { id: "trapo_si", label: "Hay trapo binocular" },
  { id: "trapo_no", label: "No hay trapo binocular" },
  { id: "sombrero_si", label: "Hay sombrero" },
  { id: "sombrero_no", label: "No hay sombrero" },
  { id: "yute_si", label: "Hay bolso yute" },
  { id: "yute_dos", label: "Hay 2 bolsos yute" },
  { id: "yute_no", label: "No hay bolso yute" },
  { id: "cola_si", label: "Hay cola caballo" },
  { id: "cola_no", label: "No hay cola caballo" },
  { id: "nota", label: "Hay nota" },
  { id: "nota_extra", label: "Hay nota extra" },
] as const;

export type ReportFilter = (typeof REPORT_FILTERS)[number]["id"];

export function parseReportFilter(value: unknown): ReportFilter | null {
  return REPORT_FILTERS.find((item) => item.id === value)?.id ?? null;
}

export function parseArchiveDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function matchesReportFilter(row: InicioRevisionRow, filter: ReportFilter | null) {
  switch (filter) {
    case "trapo_si": return normalizeText(row.trapo_binoculares ?? "") === "si";
    case "trapo_no": return normalizeText(row.trapo_binoculares ?? "") === "no";
    case "sombrero_si": return normalizeText(row.sombrero ?? "") === "si";
    case "sombrero_no": return normalizeText(row.sombrero ?? "") === "no";
    case "cola_si": return normalizeText(row.cola_caballo ?? "") === "si";
    case "cola_no": return normalizeText(row.cola_caballo ?? "") === "no";
    case "yute_si": return Number(row.bolso_yute) > 0;
    case "yute_dos": return Number(row.bolso_yute) === 2;
    case "yute_no": return hasRevisionValue(row.bolso_yute) && Number(row.bolso_yute) === 0;
    case "nota": return hasRevisionValue(row.notas);
    case "nota_extra": return hasRevisionValue(row.nota_extra);
    default: return true;
  }
}

export const CAJA_FUERTE_FILTERS = [
  "Check in",
  "Check out",
  "Si",
  "No",
  "Upsell",
  "Guardar Upsell",
  "Back to Back",
  "Room Move",
  "Show Room",
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
  const start = shiftDay(today, period === "three-days" ? -2 : -6);
  return day >= start && day <= today;
}

export function filterArchiveLocally(
  rows: InicioRevisionRow[],
  search: string,
  period: ArchivePeriod,
  status: string | null,
  today: string,
  reportFilter: ReportFilter | null = null,
  date = "",
) {
  const ordered = [...rows].sort((a, b) =>
    Number(revisionDay(a.created_at) === "sin-fecha") - Number(revisionDay(b.created_at) === "sin-fecha") ||
    b.created_at.replace("T", " ").localeCompare(a.created_at.replace("T", " ")) || b.id.localeCompare(a.id),
  );
  const seen = new Set<string>();
  return ordered.filter((row) => {
    if (date ? revisionDay(row.created_at) !== date : !matchesArchivePeriod(row, period, today)) return false;
    if (reportFilter && row.pendiente) return false;
    if (reportFilter && reportFilter !== "caja_fuerte") {
      const casita = casitaNumber(row.casita).replace(/^0+(?=\d)/, "");
      if (seen.has(casita)) return false;
      seen.add(casita);
    }
    if (status !== null && row.caja_fuerte !== status) return false;
    if (!matchesReportFilter(row, reportFilter)) return false;
    return matchesArchiveSearch(row, search);
  });
}

export function parseArchivePeriod(value: string): ArchivePeriod {
  if (value === "today" || value === "three-days" || value === "week") return value;
  return "all";
}
