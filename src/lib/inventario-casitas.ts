import { ARTICULOS_CLASES, type ArticuloKey, type ConteoArticulos } from "@/lib/articulos-model";
import { BOOLEAN_FIELDS, QUANTITY_LIMITS, type InventoryKey, type RevisionFormValues } from "@/lib/revision-form";
import type { InventarioCasitaRow } from "@/types/database";

export const INVENTARIO_KEYS = [
  "chromecast",
  "controles_tv",
  "speaker",
  "usb_speaker",
  "binoculares",
  "trapo_binoculares",
  "secadora",
  "accesorios_secadora",
  "steamer",
  "bolsa_vapor",
  "plancha_cabello",
  "bulto",
  "sombrero",
  "bolso_yute",
  "cola_caballo",
] as const satisfies readonly InventoryKey[];

export type InventarioKey = (typeof INVENTARIO_KEYS)[number];
export type InventarioCasita = { casita: number; cantidades: Record<InventarioKey, number> };
export const INVENTARIO_COLUMNS = "casita, chromecast, controles_tv, speaker, usb_speaker, binoculares, trapo_binoculares, secadora, accesorios_secadora, steamer, bolsa_vapor, plancha_cabello, bulto, sombrero, bolso_yute, cola_caballo";

const RECONOCIBLES = new Set<InventoryKey>(ARTICULOS_CLASES);

export function isReconocible(key: InventoryKey): key is ArticuloKey {
  return RECONOCIBLES.has(key);
}

export function mapInventarioCasita(row: InventarioCasitaRow): InventarioCasita {
  return {
    casita: Number(row.casita),
    cantidades: Object.fromEntries(INVENTARIO_KEYS.map((key) => {
      const value = Number(row[key]);
      return [key, Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0];
    })) as Record<InventarioKey, number>,
  };
}

export function isInventarioCasita(value: unknown): value is InventarioCasita {
  if (!value || typeof value !== "object") return false;
  const { casita, cantidades } = value as Partial<InventarioCasita>;
  return Number.isSafeInteger(casita) && !!cantidades && typeof cantidades === "object" &&
    INVENTARIO_KEYS.every((key) => Number.isSafeInteger(cantidades[key]));
}

export function valorDetectado(key: ArticuloKey, count: number) {
  if (BOOLEAN_FIELDS.has(key)) return count > 0 ? "Si" : "No";
  return String(Math.min(count, QUANTITY_LIMITS[key] ?? 99));
}

export function valoresDetectados(conteo: ConteoArticulos): Partial<RevisionFormValues> {
  return Object.fromEntries(ARTICULOS_CLASES.map((key) => [key, valorDetectado(key, conteo[key] ?? 0)])) as Partial<RevisionFormValues>;
}

function coincide(key: InventarioKey, value: string, esperado: number) {
  if (BOOLEAN_FIELDS.has(key)) return (value === "Si") === (esperado > 0);
  return /^\d{1,2}$/.test(value) && Number(value) === esperado;
}

export function textoCantidad(key: InventoryKey, count: number) {
  if (BOOLEAN_FIELDS.has(key)) return count > 0 ? "Sí" : "No";
  return String(count);
}

export type ComparacionArticulo = {
  key: InventarioKey;
  esperado: number | null;
  detectado: number | null;
  coincideAhora: boolean | null;
};

export function compararInventario(
  values: RevisionFormValues,
  detectados: Partial<Record<InventoryKey, number>>,
  inventario: InventarioCasita | null,
) {
  const revisar: ComparacionArticulo[] = [];
  const coinciden: ComparacionArticulo[] = [];
  const sinComparar: ComparacionArticulo[] = [];
  for (const key of INVENTARIO_KEYS) {
    const detectado = isReconocible(key) && typeof detectados[key] === "number" ? detectados[key] : null;
    const esperado = inventario ? inventario.cantidades[key] : null;
    const escaneoCoincide = esperado !== null && detectado !== null && detectado === esperado;
    const sinCambios = detectado !== null && isReconocible(key) && values[key] === valorDetectado(key, detectado);
    const item: ComparacionArticulo = {
      key,
      esperado,
      detectado,
      coincideAhora: esperado === null ? null
        : detectado === null ? false
        : sinCambios ? escaneoCoincide
        : coincide(key, values[key], esperado),
    };
    if (esperado === null) sinComparar.push(item);
    else if (escaneoCoincide) coinciden.push(item);
    else revisar.push(item);
  }
  return { revisar, coinciden, sinComparar };
}
