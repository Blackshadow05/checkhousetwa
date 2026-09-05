import { IDB_STORES, idbGet, idbGetAll, idbPut } from "@/lib/idb/database";
import type { RevisionCasita } from "@/types/database";

export type SyncStatus = "pending" | "synced" | "error";

export type LocalRevisionCasita = RevisionCasita & {
  _sync_status: SyncStatus;
};

export async function saveLocalRevision(row: LocalRevisionCasita) {
  await idbPut(IDB_STORES.revisiones, row);
}

export async function getLocalRevision(id: string) {
  return idbGet<LocalRevisionCasita>(IDB_STORES.revisiones, id);
}

export async function listLocalRevisiones() {
  return idbGetAll<LocalRevisionCasita>(IDB_STORES.revisiones);
}
