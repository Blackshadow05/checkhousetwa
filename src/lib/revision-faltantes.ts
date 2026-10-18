import { minuscula } from "@/lib/busqueda-filtros";
import { INVENTARIO_KEYS, type InventarioCasita, type InventarioKey } from "@/lib/inventario-casitas";
import { BOOLEAN_FIELDS, INVENTORY_FIELDS, type InventoryKey } from "@/lib/revision-form";
import { hasRevisionValue, normalizeText } from "@/lib/revisiones-display";
import type { InicioRevisionRow } from "@/types/database";

// "Falta: camas ordenadas" no se entiende; el resto usa la etiqueta del detalle.
const ETIQUETA_FALTANTE: Partial<Record<InventoryKey, string>> = {
  camas_ordenadas: "ordenar camas",
};

const EN_INVENTARIO = new Set<InventoryKey>(INVENTARIO_KEYS);

function esperadoDe(key: InventoryKey, inventario: InventarioCasita | null) {
  if (!inventario || !EN_INVENTARIO.has(key)) return null;
  return inventario.cantidades[key as InventarioKey] ?? null;
}

// Mismo criterio que el resto de la app:
// - Sí/No: "No" falta (búsqueda: "Sin …"), salvo que el inventario de la casita diga que no lleva ese artículo (0).
// - Cantidades: con dato en el inventario, falta si hay menos de lo esperado; sin dato, solo si es 0 (búsqueda: "Falta …").
// Lo que no falta solo porque el inventario indica 0 va en `noLleva`, para decirlo en vez de ocultarlo.
// Campos sin registro no cuentan. Devuelve null si la revisión no tiene ningún artículo registrado.
export function faltantesRevision(row: InicioRevisionRow, inventario: InventarioCasita | null) {
  const faltan: string[] = [];
  const noLleva: string[] = [];
  let registrados = 0;
  for (const { key, label } of INVENTORY_FIELDS) {
    const value = row[key];
    if (!hasRevisionValue(value)) continue;
    registrados += 1;
    const nombre = ETIQUETA_FALTANTE[key] ?? minuscula(label);
    const esperado = esperadoDe(key, inventario);
    if (BOOLEAN_FIELDS.has(key)) {
      if (normalizeText(value ?? "") === "no") (esperado === 0 ? noLleva : faltan).push(nombre);
      continue;
    }
    const raw = (value ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    const cantidad = Number(raw);
    if (esperado === null) {
      if (cantidad === 0) faltan.push(nombre);
    } else if (cantidad < esperado) {
      faltan.push(cantidad === 0 ? nombre : `${nombre} (hay ${cantidad} de ${esperado})`);
    } else if (cantidad === 0) {
      noLleva.push(nombre);
    }
  }
  return registrados ? { faltan, noLleva } : null;
}

const LISTA = new Intl.ListFormat("es", { style: "long", type: "conjunction" });

export function resumenFaltantes(faltan: string[]) {
  return faltan.length ? `Falta: ${LISTA.format(faltan)}` : "Todo completo";
}

export function resumenNoLleva(noLleva: string[]) {
  return noLleva.length ? `Según el inventario, esta casita no lleva ${LISTA.format(noLleva)}.` : null;
}
