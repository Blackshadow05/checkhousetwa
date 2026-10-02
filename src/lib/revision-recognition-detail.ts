import { ARTICULOS_CLASES, type ArticuloKey } from "@/lib/articulos-model";
import { BOOLEAN_FIELDS } from "@/lib/revision-form";

export type RecognitionDetailItem = {
  campo: ArticuloKey;
  detectado: string;
  guardado: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Only the two recorded values are exposed to the detail screen and its cache. */
export function recognitionDetailItems(value: unknown): RecognitionDetailItem[] {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.articulos)) return [];
  const byField = new Map<ArticuloKey, RecognitionDetailItem>();
  for (const item of value.articulos) {
    if (!isRecord(item) || !ARTICULOS_CLASES.includes(item.campo as ArticuloKey)) continue;
    const campo = item.campo as ArticuloKey;
    const count = item.detectado;
    if (count !== null && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 25_200)) continue;
    const saved = item.valor_guardado;
    const boolean = BOOLEAN_FIELDS.has(campo);
    if (typeof saved !== "string" || (boolean ? !["Si", "Sí", "No"].includes(saved) : !/^\d{1,2}$/.test(saved))) continue;
    byField.set(campo, {
      campo,
      detectado: count === null ? "Sin dato" : boolean ? (count > 0 ? "Sí" : "No") : String(count),
      guardado: boolean ? (saved === "No" ? "No" : "Sí") : String(Number(saved)),
    });
  }
  return ARTICULOS_CLASES.flatMap((campo) => {
    const item = byField.get(campo);
    return item ? [item] : [];
  });
}
