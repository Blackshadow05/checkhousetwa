import type { RevisionCasita } from "@/types/database";

export const DELETE_BATCH_SIZE = 200;
export const DELETE_PAGE_SIZE = 50;
export type RevisionParaEliminar = Pick<RevisionCasita, "id" | "casita" | "quien_revisa" | "caja_fuerte" | "created_at">;
export type RegistroEliminado = { id: string; fecha: string; usuario_id: number; usuario: string; ip: string | null; cantidad: number };
export type RevisionDeleteCursor = { id: string; fecha: string | null };
export type DeleteHistoryCursor = { id: string; fecha: string };
export type DeletePage<T, C> = { rows: T[]; nextCursor: C | null; updatedAt: string; error: string | null; denied?: boolean };
export type DeleteResult = { error: string | null; registro: RegistroEliminado | null; denied?: boolean };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validDeleteIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= DELETE_BATCH_SIZE && ids.every(isUuid) && new Set(ids.map(id => id.toLowerCase())).size === ids.length;
}

export function validDeleteCursor(cursor: unknown, nullableDate = true): cursor is RevisionDeleteCursor {
  if (!cursor || typeof cursor !== "object" || !("id" in cursor) || !("fecha" in cursor) || !isUuid(cursor.id)) return false;
  return cursor.fecha === null ? nullableDate : typeof cursor.fecha === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(cursor.fecha) && Number.isFinite(Date.parse(cursor.fecha));
}

// Revisions store wall-clock timestamps; preserve their recorded date/time.
export function deletionRevisionDate(value: string | null): string {
  if (!value) return "Sin fecha";
  return `${value.slice(0, 10).split("-").reverse().join("/")} · ${value.slice(11, 16)}`;
}

export function deletionHistoryDate(value: string): string {
  return new Date(value).toLocaleString("es-CR", { timeZone: "America/Costa_Rica", dateStyle: "medium", timeStyle: "short" });
}
