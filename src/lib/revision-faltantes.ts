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
  return inventario.cantidades[key as InventarioKey];
}

// Mismo criterio que el resto de la app:
// - Sí/No: "No" falta (búsqueda: "Sin …"), salvo que el inventario de la casita diga que no lleva ese artículo.
// - Cantidades: con inventario, falta si hay menos de lo esperado; sin inventario, solo si es 0 (búsqueda: "Falta …").
// Campos sin registro no cuentan. Devuelve null si la revisión no tiene ningún artículo registrado.
export function faltantesRevision(row: InicioRevisionRow, inventario: InventarioCasita | null) {
  const faltantes: string[] = [];
  let registrados = 0;
  for (const { key, label } of INVENTORY_FIELDS) {
    const value = row[key];
    if (!hasRevisionValue(value)) continue;
    registrados += 1;
    const nombre = ETIQUETA_FALTANTE[key] ?? minuscula(label);
    const esperado = esperadoDe(key, inventario);
    if (BOOLEAN_FIELDS.has(key)) {
      if (normalizeText(value ?? "") === "no" && esperado !== 0) faltantes.push(nombre);
      continue;
    }
    const raw = (value ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    const cantidad = Number(raw);
    if (esperado === null) {
      if (cantidad === 0) faltantes.push(nombre);
    } else if (cantidad < esperado) {
      faltantes.push(cantidad === 0 ? nombre : `${nombre} (hay ${cantidad} de ${esperado})`);
    }
  }
  return registrados ? faltantes : null;
}

const LISTA = new Intl.ListFormat("es", { style: "long", type: "conjunction" });

export function resumenFaltantes(faltantes: string[]) {
  return faltantes.length ? `Falta: ${LISTA.format(faltantes)}` : "Todo completo ✓";
}
