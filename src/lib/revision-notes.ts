import { isEvidenceCloudinaryPath } from "@/lib/revision-evidence";
import type { NotaRevisionCasita } from "@/types/database";

export const MAX_NOTA_REVISION_LENGTH = 2000;
export const NOTAS_REVISION_PAGE_SIZE = 100;

export type RevisionNoteItem = {
  id: string;
  revisionId: string;
  nota: string;
  usuario: string | null;
  imagen: string | null;
  createdAt: string;
};

type NotaRevisionSource = Pick<
  NotaRevisionCasita,
  "id" | "revision_id" | "nota" | "usuario" | "imagen" | "hora" | "created_at"
>;

export function validateNotaRevision(value: string) {
  const nota = value.trim();
  if (!nota) return "Escribe una nota antes de guardar.";
  if (nota.length > MAX_NOTA_REVISION_LENGTH) {
    return `Las notas pueden tener hasta ${MAX_NOTA_REVISION_LENGTH} caracteres.`;
  }
  return undefined;
}

export function persistNotaRevision(value: string) {
  return value.trim();
}

export function validateNotaRevisionImage(value: string | null | undefined) {
  const path = value?.trim() ?? "";
  if (!path) return undefined;
  if (!isEvidenceCloudinaryPath(path)) {
    return "La foto no se cargó correctamente. Vuelve a intentarlo.";
  }
  return undefined;
}

export function persistNotaRevisionImage(value: string | null | undefined) {
  const path = value?.trim();
  return path ? path : null;
}

export function mapNotaRevision(row: NotaRevisionSource): RevisionNoteItem {
  return {
    id: row.id,
    revisionId: row.revision_id,
    nota: row.nota,
    usuario: row.usuario?.trim() || null,
    imagen: row.imagen?.trim() || null,
    createdAt: row.hora || row.created_at || "",
  };
}

export function compareNotaRevision(a: RevisionNoteItem, b: RevisionNoteItem) {
  const left = a.createdAt || "";
  const right = b.createdAt || "";
  if (left !== right) return right.localeCompare(left);
  return b.id.localeCompare(a.id);
}

export function mergeNotaRevision(
  current: RevisionNoteItem[],
  incoming: RevisionNoteItem | RevisionNoteItem[],
) {
  const byId = new Map<string, RevisionNoteItem>();
  for (const row of current) byId.set(row.id, row);
  for (const row of Array.isArray(incoming) ? incoming : [incoming]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort(compareNotaRevision);
}

export function noteRevisionPage<T>(
  rows: T[],
  pageSize = NOTAS_REVISION_PAGE_SIZE,
) {
  const hasMore = rows.length > pageSize;
  return { rows: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}

export function sameNotaRevisionPayload(
  existing: Pick<
    NotaRevisionCasita,
    "revision_id" | "nota" | "imagen" | "usuario"
  >,
  desired: {
    revision_id: string;
    nota: string;
    imagen?: string | null;
    usuario?: string | null;
  },
) {
  return (
    existing.revision_id === desired.revision_id &&
    existing.nota === desired.nota &&
    (existing.imagen ?? null) === (desired.imagen ?? null) &&
    (existing.usuario ?? null) === (desired.usuario ?? null)
  );
}

export function canSubmitNoteRevision(input: {
  submitting: boolean;
  preparing: boolean;
  online: boolean;
  nota: string;
}) {
  return (
    !input.submitting &&
    !input.preparing &&
    input.online &&
    input.nota.trim() !== ""
  );
}
