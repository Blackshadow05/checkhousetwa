import {
  EVIDENCE_EDIT_LABELS,
  EVIDENCE_FIELDS,
  isEvidenceCloudinaryPath,
  type EvidenceField,
} from "@/lib/revision-evidence";
import { evidencePhotoLimit, MAX_PHOTOS, type RevisionPhoto } from "@/lib/revision-form";
import { puedeEditarRevision } from "@/lib/revision-edit";
import { createUuid } from "@/lib/uuid";

export { EVIDENCE_EDIT_LABELS };

export type EvidenceSlots = Record<EvidenceField, string | null>;

export type EvidenceDraftItem =
  | { kind: "existing"; id: string; path: string }
  | { kind: "new"; id: string; photo: RevisionPhoto; path?: string };

export type EvidenceEditDecision = "noop" | "stale" | "apply";

export type EvidenceEditPayload = {
  id: string;
  esperado: EvidenceSlots;
  fotos: string[];
};

export function evidenceSlotValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function evidenceSlotsFromRow(row: Partial<EvidenceSlots> | null | undefined): EvidenceSlots {
  return {
    evidencia_01: evidenceSlotValue(row?.evidencia_01),
    evidencia_02: evidenceSlotValue(row?.evidencia_02),
    evidencia_03: evidenceSlotValue(row?.evidencia_03),
  };
}

export function evidencePathsFromSlots(slots: EvidenceSlots): string[] {
  return EVIDENCE_FIELDS.map((field) => slots[field]).filter((value): value is string => Boolean(value));
}

export function compactEvidenceSlots(paths: readonly (string | null | undefined)[]): EvidenceSlots {
  const compacted = paths
    .map((path) => evidenceSlotValue(path))
    .filter((path): path is string => Boolean(path))
    .slice(0, MAX_PHOTOS);
  return {
    evidencia_01: compacted[0] ?? null,
    evidencia_02: compacted[1] ?? null,
    evidencia_03: compacted[2] ?? null,
  };
}

export function sameEvidenceSlots(left: EvidenceSlots, right: EvidenceSlots) {
  return EVIDENCE_FIELDS.every((field) => left[field] === right[field]);
}

export function validateEvidencePaths(paths: readonly (string | null | undefined)[]) {
  for (const path of paths) {
    const value = evidenceSlotValue(path);
    if (value && !isEvidenceCloudinaryPath(value)) {
      return "Una fotografía no se cargó correctamente. Vuelve a intentarlo.";
    }
  }
  return undefined;
}

export function validateRevisionEvidencePhotos(
  cajaFuerte: string | null | undefined,
  paths: readonly string[],
) {
  const pathError = validateEvidencePaths(paths);
  if (pathError) return pathError;
  const limit = evidencePhotoLimit(cajaFuerte ?? "");
  const count = paths.length;
  if (limit === 0 && count > 0) return "Esta opción no admite evidencias.";
  if (limit === 1 && count < 1) return "Añade la evidencia 1.";
  if (limit === 1 && count > 1) return "Solo puedes añadir la evidencia 1.";
  if (limit > 1 && count < 1) return "Añade la evidencia 1.";
  if (count > limit) return `Puedes añadir hasta ${limit} evidencias.`;
  return undefined;
}

export function revisionEvidenceEditDecision(
  current: EvidenceSlots,
  expected: EvidenceSlots,
  next: EvidenceSlots,
): EvidenceEditDecision {
  if (sameEvidenceSlots(current, next)) return "noop";
  if (!sameEvidenceSlots(current, expected)) return "stale";
  return "apply";
}

export function retainedEvidencePaths(current: EvidenceSlots, next: EvidenceSlots) {
  const nextSet = new Set(evidencePathsFromSlots(next));
  return evidencePathsFromSlots(current).filter((path) => nextSet.has(path));
}

export function removedEvidencePaths(current: EvidenceSlots, next: EvidenceSlots) {
  const nextSet = new Set(evidencePathsFromSlots(next));
  return evidencePathsFromSlots(current).filter((path) => !nextSet.has(path));
}

export function newEvidencePaths(current: EvidenceSlots, next: EvidenceSlots) {
  const currentSet = new Set(evidencePathsFromSlots(current));
  return evidencePathsFromSlots(next).filter((path) => !currentSet.has(path));
}

/** Existing Cloudinary files stay in storage even if the revision no longer points to them. */
export function storagePathsMustKeep(current: EvidenceSlots, next: EvidenceSlots) {
  return [...new Set([...evidencePathsFromSlots(current), ...removedEvidencePaths(current, next)])];
}

export function uploadsSafeToDiscardOnCancel(original: EvidenceSlots, newPaths: readonly string[]) {
  const keep = new Set(storagePathsMustKeep(original, original));
  return newPaths.filter((path) => !keep.has(path));
}

export function uploadsSafeToDiscardAfterSaveFailure(
  original: EvidenceSlots,
  attemptedNewPaths: readonly string[],
) {
  void attemptedNewPaths;
  void original;
  return [] as string[];
}

export function puedeEditarEvidencias(
  usuario: { nombre: string; rol?: string | null } | null | undefined,
  quienRevisa: string | null | undefined,
) {
  if (!usuario) return false;
  return puedeEditarRevision(usuario, quienRevisa);
}

function parseSlot(value: unknown) {
  if (value !== null && typeof value !== "string") return undefined;
  return evidenceSlotValue(value);
}

export function parseEvidenceEditPayload(input: unknown): EvidenceEditPayload | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  const data = input as { id?: unknown; esperado?: unknown; fotos?: unknown };
  if (typeof data.id !== "string") {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  if (!Array.isArray(data.fotos)) {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  if (data.fotos.some((path) => typeof path !== "string")) {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  if (data.fotos.length > MAX_PHOTOS) {
    return { error: `Puedes añadir hasta ${MAX_PHOTOS} evidencias.` };
  }
  if (!data.esperado || typeof data.esperado !== "object") {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  const esperadoRaw = data.esperado as Record<string, unknown>;
  if (
    !("evidencia_01" in esperadoRaw) ||
    !("evidencia_02" in esperadoRaw) ||
    !("evidencia_03" in esperadoRaw)
  ) {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  const evidencia_01 = parseSlot(esperadoRaw.evidencia_01);
  const evidencia_02 = parseSlot(esperadoRaw.evidencia_02);
  const evidencia_03 = parseSlot(esperadoRaw.evidencia_03);
  if (evidencia_01 === undefined || evidencia_02 === undefined || evidencia_03 === undefined) {
    return { error: "Revisa los datos e inténtalo de nuevo." };
  }
  return {
    id: data.id,
    esperado: { evidencia_01, evidencia_02, evidencia_03 },
    fotos: data.fotos,
  };
}

export function evidenceDraftFromRow(row: Partial<EvidenceSlots> | null | undefined): EvidenceDraftItem[] {
  return evidencePathsFromSlots(evidenceSlotsFromRow(row)).map((path) => ({
    kind: "existing" as const,
    id: createUuid(),
    path,
  }));
}

export function snapshotEvidenceDraft(items: readonly EvidenceDraftItem[]): EvidenceDraftItem[] {
  return items.map((item) => (item.kind === "existing" ? { ...item } : { ...item, photo: item.photo }));
}

export function canAddEvidenceDraft(
  items: readonly EvidenceDraftItem[],
  cajaFuerte: string | null | undefined,
) {
  return items.length < evidencePhotoLimit(cajaFuerte ?? "");
}

export function addEvidenceDraftItems(
  items: readonly EvidenceDraftItem[],
  photos: readonly RevisionPhoto[],
  cajaFuerte: string | null | undefined,
) {
  const limit = evidencePhotoLimit(cajaFuerte ?? "");
  const room = Math.max(0, limit - items.length);
  const added = photos.slice(0, room).map((photo) => ({
    kind: "new" as const,
    id: photo.id,
    photo,
  }));
  return {
    items: [...items, ...added],
    added,
    skipped: Math.max(0, photos.length - added.length),
    limit,
  };
}

export function removeEvidenceDraftItem(items: readonly EvidenceDraftItem[], id: string) {
  const removed = items.find((item) => item.id === id) ?? null;
  return {
    items: items.filter((item) => item.id !== id),
    removed,
  };
}

export function markEvidenceDraftUploaded(
  items: readonly EvidenceDraftItem[],
  id: string,
  path: string,
): EvidenceDraftItem[] {
  return items.map((item) =>
    item.kind === "new" && item.id === id ? { ...item, path } : item,
  );
}

export function evidenceDraftKnownPaths(items: readonly EvidenceDraftItem[]) {
  return items.flatMap((item) => {
    if (item.kind === "existing") return [item.path];
    return item.path ? [item.path] : [];
  });
}

export function evidenceDraftNeedsUpload(items: readonly EvidenceDraftItem[]) {
  return items.some((item) => item.kind === "new" && !item.path);
}

export function evidenceDraftSlots(items: readonly EvidenceDraftItem[]): EvidenceSlots | null {
  const paths: string[] = [];
  for (const item of items) {
    if (item.kind === "existing") paths.push(item.path);
    else if (item.path) paths.push(item.path);
    else return null;
  }
  return compactEvidenceSlots(paths);
}

export function evidenceDraftCancelPlan(
  snapshot: readonly EvidenceDraftItem[],
  current: readonly EvidenceDraftItem[],
) {
  const keepIds = new Set(snapshot.map((item) => item.id));
  return {
    restored: snapshotEvidenceDraft(snapshot),
    discard: current.filter((item) => item.kind === "new" && !keepIds.has(item.id)),
  };
}

export function evidenceDraftSaveFailurePlan(
  snapshot: readonly EvidenceDraftItem[],
  current: readonly EvidenceDraftItem[],
) {
  return {
    keepDraft: current,
    discard: [] as EvidenceDraftItem[],
    preexisting: snapshot.filter((item) => item.kind === "existing").map((item) => item.path),
  };
}
