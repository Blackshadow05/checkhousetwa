import { weekdayName } from "@/lib/menus";

export type MenuEscaneado = { fecha: string; diaSemana: string; comidas: string[] };

export const MENU_SCAN_MAX_DIAS = 31;
export const MENU_SCAN_MAX_PLATOS = 20;
export const MENU_SCAN_MAX_PLATO_CHARS = 120;

const PLATOS_VACIOS = new Set([
  "n/a",
  "ninguno",
  "no disponible",
  "no hay informacion",
  "sin datos",
  "sin informacion",
  "sin informacion disponible",
]);

function esPlato(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const limpio = valor.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return limpio.length > 0 && !PLATOS_VACIOS.has(limpio);
}

export function fechaMenuValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function limpiarPlato(valor: string) {
  return valor.replace(/^[•\-*]\s*/, "").replace(/\s+/g, " ").trim().slice(0, MENU_SCAN_MAX_PLATO_CHARS);
}

export function normalizarMenusEscaneados(raw: unknown): MenuEscaneado[] {
  const lista = raw && typeof raw === "object" && Array.isArray((raw as { menus?: unknown }).menus)
    ? (raw as { menus: unknown[] }).menus
    : [];
  const porFecha = new Map<string, string[]>();
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const { fecha, comidas } = item as { fecha?: unknown; comidas?: unknown };
    if (!fechaMenuValida(fecha) || !Array.isArray(comidas)) continue;
    const platos = comidas.filter(esPlato).map(limpiarPlato).filter(Boolean);
    if (!platos.length) continue;
    const actuales = porFecha.get(fecha) ?? [];
    for (const plato of platos) {
      if (actuales.length < MENU_SCAN_MAX_PLATOS && !actuales.includes(plato)) actuales.push(plato);
    }
    porFecha.set(fecha, actuales);
  }
  return [...porFecha]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MENU_SCAN_MAX_DIAS)
    .map(([fecha, comidas]) => ({ fecha, diaSemana: weekdayName(fecha), comidas }));
}
