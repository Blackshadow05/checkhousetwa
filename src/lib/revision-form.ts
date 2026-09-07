import { ELECTRONIC_FIELDS, EQUIPMENT_FIELDS } from "@/lib/revisiones-display";
import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import type { RevisionCasitaInsert } from "@/types/database";
import { createUuid } from "@/lib/uuid";

export const INVENTORY_FIELDS = [...ELECTRONIC_FIELDS, ...EQUIPMENT_FIELDS];
export type InventoryKey = (typeof INVENTORY_FIELDS)[number]["key"];
export const BOOLEAN_FIELDS = new Set<InventoryKey>(["camas_ordenadas", "cola_caballo", "trapo_binoculares", "bolsa_vapor", "bulto", "sombrero"]);
export const QUANTITY_LIMITS: Partial<Record<InventoryKey, number>> = {
  chromecast: 4, speaker: 3, usb_speaker: 3, controles_tv: 3,
  binoculares: 3, secadora: 3, accesorios_secadora: 8,
  steamer: 3, plancha_cabello: 2, bolso_yute: 3,
};
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const CAJA_FUERTE_NO_EVIDENCE = new Set(["Si", "No"]);
export const CAJA_FUERTE_SINGLE_EVIDENCE = new Set(["Check out", "Guardar Upsell"]);

export function evidencePhotoLimit(cajaFuerte: string): 0 | 1 | typeof MAX_PHOTOS {
  if (!cajaFuerte || CAJA_FUERTE_NO_EVIDENCE.has(cajaFuerte)) return 0;
  if (CAJA_FUERTE_SINGLE_EVIDENCE.has(cajaFuerte)) return 1;
  return MAX_PHOTOS;
}

export type RevisionFormValues = Record<InventoryKey, string> & {
  casita: string;
  quien_revisa: string;
  created_at: string;
  caja_fuerte: string;
  puertas_ventanas: string;
  room_move: string;
  notas: string;
};
export type RevisionPhoto = { id: string; name: string; blob: Blob; url?: string };
export type RevisionDraft = {
  id: string;
  values: RevisionFormValues;
  photos: RevisionPhoto[];
};
export type RevisionFormErrors = Partial<Record<keyof RevisionFormValues | "evidencias", string>>;

export function costaRicaDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function withCurrentRevisionTime(values: RevisionFormValues, date = new Date()): RevisionFormValues {
  return { ...values, created_at: costaRicaDateTime(date) };
}

export function formatRevisionDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
}

export function newRevisionDraft(): RevisionDraft {
  return {
    id: createUuid(), photos: [],
    values: {
      ...Object.fromEntries(INVENTORY_FIELDS.map(({ key }) => [key, ""])) as Record<InventoryKey, string>,
      casita: "", quien_revisa: "", created_at: costaRicaDateTime(),
      caja_fuerte: "", puertas_ventanas: "", room_move: "", notas: "",
    },
  };
}

export function validateRevisionForm(values: RevisionFormValues, step?: number, photoCount = 0): RevisionFormErrors {
  const errors: RevisionFormErrors = {};
  if (step === undefined || step === 0) {
    if (!/^\d{1,3}$/.test(values.casita?.trim()) || Number(values.casita) < 1 || Number(values.casita) > 50)
      errors.casita = "Selecciona una casita del 1 al 50.";
    if (!values.quien_revisa?.trim() || values.quien_revisa.trim().length > 100)
      errors.quien_revisa = "Escribe el nombre de quien revisa (máximo 100 caracteres).";
    const date = values.created_at;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date ?? "") ||
      Number.isNaN(Date.parse(`${date}:00Z`)) ||
      new Date(`${date}:00Z`).toISOString().slice(0, 16) !== date)
      errors.created_at = "Indica una fecha y una hora válidas.";
    if (!(CAJA_FUERTE_FILTERS as readonly string[]).includes(values.caja_fuerte))
      errors.caja_fuerte = "Selecciona el estado de la caja fuerte.";
    if (!values.puertas_ventanas?.trim() || values.puertas_ventanas.length > 500)
      errors.puertas_ventanas = "Describe el estado de puertas y ventanas (máximo 500 caracteres).";
    if (values.caja_fuerte === "Room Move") {
      if (!values.room_move?.trim() || values.room_move.length > 120)
        errors.room_move = "Indica el movimiento entre casitas (máximo 120 caracteres).";
    } else if ((values.room_move?.length ?? 0) > 120) {
      errors.room_move = "Indica el movimiento entre casitas (máximo 120 caracteres).";
    }
    if (step === undefined) {
      const limit = evidencePhotoLimit(values.caja_fuerte);
      if (limit === 0 && photoCount > 0) errors.evidencias = "Esta opción no admite evidencias.";
      else if (limit === 1 && photoCount < 1) errors.evidencias = "Añade la evidencia 01.";
      else if (limit === 1 && photoCount > 1) errors.evidencias = "Solo puedes añadir la evidencia 01.";
      else if (limit > 1 && photoCount < 1) errors.evidencias = "Añade la evidencia 01.";
      else if (photoCount > limit) errors.evidencias = `Puedes añadir hasta ${limit} evidencias.`;
    }
  }
  const fields = step === 1 ? ELECTRONIC_FIELDS : step === 2 ? EQUIPMENT_FIELDS : step === undefined ? INVENTORY_FIELDS : [];
  for (const { key } of fields) {
    if (BOOLEAN_FIELDS.has(key)) {
      if (values[key] !== "Si" && values[key] !== "No") errors[key] = "Selecciona Sí o No.";
    } else if (!/^\d{1,2}$/.test(values[key] ?? "") || Number(values[key]) > (QUANTITY_LIMITS[key] ?? 99)) {
      errors[key] = `Selecciona una cantidad de 0 a ${QUANTITY_LIMITS[key] ?? 99}.`;
    }
  }
  if ((step === undefined || step === 3) && (values.notas?.length ?? 0) > 2000)
    errors.notas = "Las notas pueden tener hasta 2000 caracteres.";
  return errors;
}

// Only these fields may cross the write boundary. Never spread a client payload.
export function revisionInsert(id: string, values: RevisionFormValues, photos: string[]): RevisionCasitaInsert {
  const inventory = Object.fromEntries(INVENTORY_FIELDS.map(({ key }) => [key,
    BOOLEAN_FIELDS.has(key) ? values[key] : String(Number(values[key])),
  ]));
  return {
    ...inventory, id, casita: String(Number(values.casita)),
    quien_revisa: values.quien_revisa.trim(), created_at: values.created_at.replace("T", " "),
    caja_fuerte: values.caja_fuerte, puertas_ventanas: values.puertas_ventanas.trim(),
    room_move: values.room_move.trim() || null, notas: values.notas.trim() || null,
    evidencia_01: photos[0] ?? null, evidencia_02: photos[1] ?? null, evidencia_03: photos[2] ?? null,
  };
}
