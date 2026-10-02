import { ARTICULOS_CLASES, type ArticuloKey } from "@/lib/articulos-model";
import { compararInventario, valorDetectado, type InventarioCasita } from "@/lib/inventario-casitas";
import { BOOLEAN_FIELDS, type RevisionFormValues } from "@/lib/revision-form";

export type RevisionRecognitionInput = {
  detectados: Partial<Record<ArticuloKey, number>>;
  at: string;
  model?: string;
};

export type RegistroArticuloReconocimiento = {
  campo: ArticuloKey;
  detectado: number | null;
  inventario: number | null;
  valor_escaneo: string | null;
  valor_guardado: string;
  estado_escaneo: "revisar" | "identificado" | "sin_inventario";
  modificado_por_usuario: boolean;
};

export type RegistroReconocimiento = {
  version: 1;
  modelo: string | null;
  escaneado_en: string;
  inventario_comparado_en: string;
  inventario_disponible: boolean;
  articulos: RegistroArticuloReconocimiento[];
};

// Pick the detector's 14 classes only: beds and USB speaker are never included.
export function parseRevisionRecognition(value: unknown): RevisionRecognitionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { detectados, at, model } = value as Record<string, unknown>;
  if (!detectados || typeof detectados !== "object" || Array.isArray(detectados) ||
    typeof at !== "string" || at.length > 32 || !Number.isFinite(Date.parse(at)) ||
    (model !== undefined && (typeof model !== "string" || !/^yolo26n-v\d{1,3}$/.test(model)))) return null;
  const counts = detectados as Record<string, unknown>;
  const cleaned: RevisionRecognitionInput["detectados"] = {};
  for (const key of ARTICULOS_CLASES) {
    if (counts[key] === undefined) continue;
    const count = counts[key];
    // The raw 640px head has at most 8,400 candidates per photo (three photos).
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 25_200) return null;
    cleaned[key] = count;
  }
  if (!Object.keys(cleaned).length) return null;
  return { detectados: cleaned, at: new Date(at).toISOString(), ...(typeof model === "string" ? { model } : {}) };
}

export function registroReconocimiento(
  values: RevisionFormValues,
  recognition: RevisionRecognitionInput,
  inventario: InventarioCasita | null,
  comparedAt = new Date().toISOString(),
): RegistroReconocimiento {
  const comparison = compararInventario(values, recognition.detectados, inventario);
  const originalIssues = new Set(comparison.revisar.map(item => item.key));
  const items = new Map([...comparison.revisar, ...comparison.coinciden, ...comparison.sinComparar].map(item => [item.key, item]));
  const articulos: RegistroArticuloReconocimiento[] = [];
  for (const campo of ARTICULOS_CLASES) {
    const item = items.get(campo)!;
    const valorEscaneo = item.detectado === null ? null : valorDetectado(campo, item.detectado);
    const valorGuardado = BOOLEAN_FIELDS.has(campo) ? values[campo] : String(Number(values[campo]));
    const modificado = valorEscaneo !== null && valorEscaneo !== valorGuardado;
    // Keep original scan failures even after correction, and edits to initially correct items.
    if (!originalIssues.has(campo) && !modificado) continue;
    articulos.push({
      campo, detectado: item.detectado, inventario: item.esperado,
      valor_escaneo: valorEscaneo, valor_guardado: valorGuardado,
      estado_escaneo: item.esperado === null ? "sin_inventario" : originalIssues.has(campo) ? "revisar" : "identificado",
      modificado_por_usuario: modificado,
    });
  }
  return {
    version: 1, modelo: recognition.model ?? null, escaneado_en: recognition.at,
    inventario_comparado_en: comparedAt, inventario_disponible: inventario !== null, articulos,
  };
}
