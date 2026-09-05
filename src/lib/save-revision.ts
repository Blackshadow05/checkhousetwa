import type { SupabaseClient } from "@supabase/supabase-js";
import { REVISIONES_TABLE } from "@/lib/constants";
import { INICIO_REVISION_COLUMNS } from "@/lib/revisiones-display";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type { Database, RevisionCasitaInsert } from "@/types/database";

export async function saveRevision(client: SupabaseClient<Database>, row: RevisionCasitaInsert) {
  const result = await client.from(REVISIONES_TABLE).insert(row).select(INICIO_REVISION_COLUMNS).single();
  if (!result.error) return { row: mapInicioRevision(result.data), error: null };
  // A retry after a lost response must not create another revision or overwrite one.
  if (result.error.code === "23505" && row.id) {
    const existing = await client.from(REVISIONES_TABLE).select(INICIO_REVISION_COLUMNS).eq("id", row.id).single();
    if (!existing.error) return { row: mapInicioRevision(existing.data), error: null };
  }
  return { row: null, error: "No pudimos confirmar el guardado. Conservamos tu borrador; vuelve a intentarlo." };
}
