import type { MenuDelDia, MenuRow } from "@/types/database";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function addDaysKey(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateNum}`;
}

export function weekdayName(day: string) {
  const name = new Intl.DateTimeFormat("es-CR", {
    weekday: "long",
  }).format(new Date(`${day}T12:00:00`));
  return name.charAt(0).toLocaleUpperCase("es-CR") + name.slice(1);
}

export function menuDateHeading(day: string) {
  const formatted = new Intl.DateTimeFormat("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00`));
  return formatted.charAt(0).toLocaleUpperCase("es-CR") + formatted.slice(1);
}

function parseMenuContent(contenido: string): {
  diaSemana: string;
  comidas: string[];
} {
  try {
    const parsed: unknown = JSON.parse(contenido);
    if (!isRecord(parsed)) {
      const trimmed = contenido.trim();
      return { diaSemana: "", comidas: trimmed ? [trimmed] : [] };
    }
    const diaSemana =
      typeof parsed.dia_semana === "string" ? parsed.dia_semana.trim() : "";
    const raw = parsed.comidas;
    const comidas = Array.isArray(raw)
      ? raw
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
          .map((item) => item.trim())
      : [];
    return { diaSemana, comidas };
  } catch {
    const trimmed = contenido.trim();
    return { diaSemana: "", comidas: trimmed ? [trimmed] : [] };
  }
}

export function mapMenuRow(row: MenuRow): MenuDelDia {
  const parsed = parseMenuContent(row.contenido_menu);
  return {
    id: row.id,
    fecha: row.fecha_menu,
    diaSemana: parsed.diaSemana || weekdayName(row.fecha_menu),
    comidas: parsed.comidas,
  };
}

export function mapMenus(rows: MenuRow[]): MenuDelDia[] {
  const unique = new Map<string, MenuDelDia>();
  for (const row of rows) {
    if (unique.has(row.fecha_menu)) continue;
    unique.set(row.fecha_menu, mapMenuRow(row));
  }
  return [...unique.values()];
}

export function menuChipLabel(fecha: string, today: string) {
  if (fecha === today) return "Hoy";
  if (fecha === addDaysKey(today, 1)) return "Mañana";
  const weekday = new Intl.DateTimeFormat("es-CR", {
    weekday: "short",
    day: "numeric",
  }).format(new Date(`${fecha}T12:00:00`));
  const cleaned = weekday.replace(".", "").trim();
  return cleaned.charAt(0).toLocaleUpperCase("es-CR") + cleaned.slice(1);
}
