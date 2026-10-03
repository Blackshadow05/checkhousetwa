import type { Database } from "@/types/database";

export type LoginLog = Pick<Database["public"]["Tables"]["login_logs"]["Row"], "id" | "usuario" | "ip_address" | "metodo" | "logged_at">;
export type LoginLogsCursor = { loggedAt: string; id: string };
export type LoginLogsSnapshot = {
  ownerId: number;
  rows: LoginLog[];
  nextCursor: LoginLogsCursor | null;
  updatedAt: string;
};
export type LoginLogsResult = { snapshot: LoginLogsSnapshot | null; error: string | null; denied?: boolean };

export const LOGIN_LOGS_PAGE_SIZE = 50;

const zone = "America/Costa_Rica";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("es-CR", { timeZone: zone, day: "numeric", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("es-CR", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true });

export function loginLogTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

export function loginLogDay(value: string): string {
  return dayFormatter.format(new Date(value));
}

export function loginLogDayLabel(value: string, now = new Date()): string {
  const date = new Date(value);
  const day = loginLogDay(value);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const prefix = day === dayFormatter.format(now) ? "Hoy · " : day === dayFormatter.format(yesterday) ? "Ayer · " : "";
  return prefix + dateFormatter.format(date);
}

export function loginLogMethod(value: string): string {
  return ({ password: "Contraseña", authenticator: "Authenticator", google: "Google" } as Record<string, string>)[value] || value || "Sin método";
}

export function validLoginLogsCursor(value: unknown): value is LoginLogsCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Partial<LoginLogsCursor>;
  return typeof cursor.id === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(cursor.id)
    && typeof cursor.loggedAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.loggedAt)
    && Number.isFinite(Date.parse(cursor.loggedAt));
}
