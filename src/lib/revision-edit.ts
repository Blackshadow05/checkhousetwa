import { CAJA_FUERTE_FILTERS } from "@/lib/revisiones-archive";
import {
  BOOLEAN_FIELDS,
  INVENTORY_FIELDS,
  QUANTITY_LIMITS,
  evidencePhotoLimit,
} from "@/lib/revision-form";
import type { RevisionCasitaInicio } from "@/types/database";

export const REVISION_EDIT_FIELDS = [
  "casita",
  "quien_revisa",
  "caja_fuerte",
  "puertas_ventanas",
  "room_move",
  "notas",
  ...INVENTORY_FIELDS.map(({ key }) => key),
] as const;

export type RevisionEditField = (typeof REVISION_EDIT_FIELDS)[number];

export const REVISION_EDIT_LABELS: Record<RevisionEditField, string> = {
  casita: "Casita",
  quien_revisa: "Quién revisa",
  caja_fuerte: "Caja fuerte",
  puertas_ventanas: "Puertas y ventanas",
  room_move: "Movimiento entre casitas",
  notas: "Notas",
  chromecast: "Chromecast",
  speaker: "Speaker",
  usb_speaker: "USB speaker",
  controles_tv: "Controles TV",
  binoculares: "Binoculares",
  trapo_binoculares: "Trapo de binoculares",
  secadora: "Secadora",
  accesorios_secadora: "Accesorios secadora",
  steamer: "Steamer",
  bolsa_vapor: "Bolsa vapor",
  plancha_cabello: "Plancha de cabello",
  bulto: "Bulto",
  sombrero: "Sombrero",
  bolso_yute: "Bolso de yute",
  camas_ordenadas: "Camas ordenadas",
  cola_caballo: "Cola de caballo",
};

export function isRevisionEditField(value: string): value is RevisionEditField {
  return (REVISION_EDIT_FIELDS as readonly string[]).includes(value);
}

export function editorValueFromRaw(value: string | null | undefined) {
  return value ?? "";
}

export function auditRawLabel(value: string | null | undefined) {
  return value == null ? "null" : value;
}

export function formatRevisionAuditLine(
  id: string,
  casita: string | null | undefined,
  field: RevisionEditField,
  value: string | null | undefined,
) {
  return `[${id}] casita ${casita == null ? "null" : casita} ${field}: ${auditRawLabel(value)}`;
}

const AUDIT_UUID =
  /^\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export function parseRevisionAuditLine(line: string | null | undefined) {
  if (!line) return null;
  const match =
    /^\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\](?: casita (\S+))? ([a-z0-9_]+): ([\s\S]*)$/i.exec(
      line,
    );
  if (!match) return null;
  const field = match[3] ?? "";
  const rawValue = match[4] ?? "";
  return {
    id: match[1],
    casita: !match[2] || match[2] === "null" ? null : match[2],
    field,
    value: rawValue === "null" ? null : rawValue,
  };
}

function auditFallbackValue(line: string | null) {
  if (!line) return null;
  return line.replace(AUDIT_UUID, "").trimStart() || null;
}

export function displayAuditValue(value: string | null | undefined) {
  return value == null ? "Sin registro" : value;
}

export type RevisionEditHistoryItem = {
  id: number;
  createdAt: string;
  actor: string;
  field: string;
  label: string;
  previous: string | null;
  next: string | null;
};

export function mapRegistroEdicion(row: {
  id: number;
  created_at: string;
  "Usuario que Edito": string | null;
  Dato_anterior: string | null;
  Dato_nuevo: string | null;
}): RevisionEditHistoryItem {
  const previous = parseRevisionAuditLine(row.Dato_anterior);
  const next = parseRevisionAuditLine(row.Dato_nuevo);
  const field = next?.field || previous?.field || "";
  return {
    id: row.id,
    createdAt: row.created_at,
    actor: row["Usuario que Edito"]?.trim() || "Alguien del equipo",
    field,
    label: isRevisionEditField(field) ? REVISION_EDIT_LABELS[field] : "Cambio",
    previous: previous ? previous.value : auditFallbackValue(row.Dato_anterior),
    next: next ? next.value : auditFallbackValue(row.Dato_nuevo),
  };
}

export function persistRevisionFieldValue(field: RevisionEditField, value: string | null) {
  if (value == null || value.trim() === "") return null;
  if (field === "quien_revisa") return value.trim();
  return value;
}

export function validateRevisionField(field: RevisionEditField, value: string | null) {
  const persisted = persistRevisionFieldValue(field, value);
  if (field === "casita") {
    if (!persisted || !/^\d{1,2}$/.test(persisted) || Number(persisted) < 1 || Number(persisted) > 50) {
      return "Selecciona una casita del 1 al 50.";
    }
    return undefined;
  }
  if (field === "quien_revisa") {
    if (!persisted || persisted.length > 100) return "Escribe el nombre de quien revisa (máximo 100 caracteres).";
    return undefined;
  }
  if (field === "caja_fuerte") {
    if (!persisted || !(CAJA_FUERTE_FILTERS as readonly string[]).includes(persisted)) {
      return "Selecciona el estado de la caja fuerte.";
    }
    return undefined;
  }
  if (field === "puertas_ventanas" && persisted && persisted.length > 500) {
    return "Describe el estado de puertas y ventanas (máximo 500 caracteres).";
  }
  if (field === "room_move" && persisted && persisted.length > 120) {
    return "Indica el movimiento entre casitas (máximo 120 caracteres).";
  }
  if (field === "notas" && persisted && persisted.length > 2000) {
    return "Las notas pueden tener hasta 2000 caracteres.";
  }
  if (BOOLEAN_FIELDS.has(field as (typeof INVENTORY_FIELDS)[number]["key"])) {
    if (persisted && persisted !== "Si" && persisted !== "No") return "Selecciona Sí o No.";
    return undefined;
  }
  const max = QUANTITY_LIMITS[field as keyof typeof QUANTITY_LIMITS];
  if (max !== undefined) {
    if (persisted && (!/^\d{1,2}$/.test(persisted) || Number(persisted) > max)) {
      return `Selecciona una cantidad de 0 a ${max}.`;
    }
  }
  return undefined;
}

function evidenceCount(row: Pick<RevisionCasitaInicio, "evidencia_01" | "evidencia_02" | "evidencia_03">) {
  return (["evidencia_01", "evidencia_02", "evidencia_03"] as const).filter(
    (key) => row[key]?.trim(),
  ).length;
}

export function validateRevisionFieldDependencies(
  field: RevisionEditField,
  value: string | null,
  row: Pick<
    RevisionCasitaInicio,
    "caja_fuerte" | "room_move" | "evidencia_01" | "evidencia_02" | "evidencia_03"
  >,
) {
  const persisted = persistRevisionFieldValue(field, value);
  if (field === "caja_fuerte") {
    const room = persistRevisionFieldValue("room_move", row.room_move);
    const photos = evidenceCount(row);
    if (persisted === "Room Move" && !room) {
      return "Indica el movimiento entre casitas (máximo 120 caracteres).";
    }
    const limit = evidencePhotoLimit(persisted ?? "");
    if (limit === 0 && photos !== 0) return "Esta opción no admite evidencias.";
    if (limit === 1 && (!row.evidencia_01?.trim() || photos !== 1)) {
      return "Esta opción requiere solo la evidencia 01.";
    }
    if (limit > 1 && (!row.evidencia_01?.trim() || photos < 1 || photos > 3)) {
      return "Añade la evidencia 01.";
    }
    return undefined;
  }
  if (field === "room_move" && row.caja_fuerte === "Room Move" && !persisted) {
    return "Indica el movimiento entre casitas (máximo 120 caracteres).";
  }
  return undefined;
}

export type RevisionEditDecision = "noop" | "stale" | "apply";

function numericEquivalent(left: string | null, right: string | null) {
  return Boolean(
    left &&
      right &&
      /^\d{1,2}$/.test(left) &&
      /^\d{1,2}$/.test(right) &&
      Number(left) === Number(right),
  );
}

function booleanEquivalent(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if ((a === "si" || a === "sí") && (b === "si" || b === "sí")) return true;
  return a === "no" && b === "no";
}

export function revisionEditDecision(
  current: string | null,
  expected: string | null,
  nuevo: string | null,
  field: RevisionEditField,
): RevisionEditDecision {
  const desired = persistRevisionFieldValue(field, nuevo);
  if (current === desired) return "noop";
  if (field === "casita" && numericEquivalent(current, desired)) return "noop";
  if (QUANTITY_LIMITS[field as keyof typeof QUANTITY_LIMITS] !== undefined && numericEquivalent(current, desired)) {
    return "noop";
  }
  if (BOOLEAN_FIELDS.has(field as (typeof INVENTORY_FIELDS)[number]["key"]) && booleanEquivalent(current, desired)) {
    return "noop";
  }
  if (current !== expected) return "stale";
  return "apply";
}

export function replaceArchiveRow<T extends { id?: string }>(rows: T[], row: T) {
  if (!row.id) return rows;
  let changed = false;
  const next = rows.map((item) => {
    if (item.id !== row.id) return item;
    changed = true;
    return row;
  });
  return changed ? next : rows;
}
