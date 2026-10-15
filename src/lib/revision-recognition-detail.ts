import { ARTICULOS_CLASES, type ArticuloKey } from "@/lib/articulos-model";
import { BOOLEAN_FIELDS } from "@/lib/revision-form";

export type RecognitionDetailEstado = "revisar" | "identificado" | "sin_inventario";

export type RecognitionDetailItem = {
  campo: ArticuloKey;
  detectado: string;
  guardado: string;
  estado?: RecognitionDetailEstado;
  cambiado?: boolean;
};

export type RecognitionDetail = {
  items: RecognitionDetailItem[];
  coincidieron: number | null;
};

const EXCLUIDOS = new Set<string>(["camas_ordenadas", "usb_speaker"]);
const ESTADOS = new Set<string>(["revisar", "identificado", "sin_inventario"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 25_200;
}

function texto(campo: ArticuloKey, value: string) {
  if (BOOLEAN_FIELDS.has(campo)) return value === "No" ? "No" : "Sí";
  return String(Number(value));
}

function valorValido(campo: ArticuloKey, value: unknown): value is string {
  if (typeof value !== "string") return false;
  return BOOLEAN_FIELDS.has(campo) ? ["Si", "Sí", "No"].includes(value) : /^\d{1,2}$/.test(value);
}

export function recognitionDetailItems(value: unknown): RecognitionDetail | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.articulos)) return undefined;
  const byField = new Map<ArticuloKey, RecognitionDetailItem>();
  for (const item of value.articulos) {
    if (!isRecord(item) || !ARTICULOS_CLASES.includes(item.campo as ArticuloKey) || EXCLUIDOS.has(String(item.campo))) continue;
    const campo = item.campo as ArticuloKey;
    const boolean = BOOLEAN_FIELDS.has(campo);
    const count = item.detectado;
    if (count !== null && !validCount(count)) continue;
    if (!valorValido(campo, item.valor_guardado)) continue;
    const guardado = texto(campo, item.valor_guardado);
    const detectado = valorValido(campo, item.valor_escaneo)
      ? texto(campo, item.valor_escaneo)
      : count === null ? "Sin dato" : boolean ? (count > 0 ? "Sí" : "No") : String(count);
    const estado = typeof item.estado_escaneo === "string" && ESTADOS.has(item.estado_escaneo)
      ? item.estado_escaneo as RecognitionDetailEstado
      : validCount(item.inventario) ? "revisar" : "sin_inventario";
    byField.set(campo, {
      campo,
      detectado,
      guardado,
      estado,
      cambiado: typeof item.modificado_por_usuario === "boolean" ? item.modificado_por_usuario : detectado !== guardado,
    });
  }
  const items = ARTICULOS_CLASES.flatMap((campo) => {
    const item = byField.get(campo);
    return item ? [item] : [];
  });
  const coincidieron = validCount(value.coincidieron) ? value.coincidieron : null;
  if (!items.length && !coincidieron) return undefined;
  return { items, coincidieron };
}

export function normalizeRecognitionDetail(value: RecognitionDetail | RecognitionDetailItem[] | undefined): RecognitionDetail | null {
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? { items: value, coincidieron: null } : null;
  return value.items.length || value.coincidieron ? value : null;
}
