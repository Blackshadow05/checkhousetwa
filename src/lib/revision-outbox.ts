import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { pendienteInsert, revisionInsert, type RevisionDraft } from "@/lib/revision-form";
import type { RevisionRecognitionInput } from "@/lib/revision-recognition-log";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type { InicioRevisionRow, RevisionCasitaInicio } from "@/types/database";

export type PendingRevisionStatus = "saving" | "waiting" | "error";

export type PendingRevision = {
  draft: RevisionDraft;
  reconocimiento: RevisionRecognitionInput | null;
  row: InicioRevisionRow;
  status: PendingRevisionStatus;
  error: string | null;
};

const OUTBOX_KEY = "revision-outbox-v1";
type Snapshot = { id: typeof OUTBOX_KEY; items: PendingRevision[] };

export function pendingRevisionRow(draft: RevisionDraft): InicioRevisionRow {
  if (draft.completarDespues) {
    const insert = pendienteInsert(draft.id, draft.values);
    return mapInicioRevision({ ...insert, marcada_por: insert.quien_revisa, marcada_at: insert.created_at } as RevisionCasitaInicio);
  }
  const insert = revisionInsert(draft.id, draft.values, []);
  return mapInicioRevision({ ...insert, registro_reconocimiento: null, marcada_por: draft.completa?.marcadaPor ?? null } as RevisionCasitaInicio);
}

export async function loadOutbox(): Promise<PendingRevision[]> {
  const saved = await idbGet<Snapshot>(IDB_STORES.snapshots, OUTBOX_KEY);
  return Array.isArray(saved?.items) ? saved.items : [];
}

export function storeOutbox(items: PendingRevision[]) {
  return idbPut<Snapshot>(IDB_STORES.snapshots, { id: OUTBOX_KEY, items });
}
