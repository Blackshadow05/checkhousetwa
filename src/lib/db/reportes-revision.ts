import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTAS_REVISIONES_TABLE, REVISIONES_TABLE } from "@/lib/constants";
import {
  REPORTE_REVISION_COLUMNS,
  type ReporteRevisionNote,
  type ReporteRevisionRange,
  type ReporteRevisionRow,
} from "@/lib/reportes-revision";
import type { Database } from "@/types/database";

const PAGE_SIZE = 500;
const REVISION_BATCH_SIZE = 100;
type Client = SupabaseClient<Database>;
const LOAD_ERROR = "No pudimos cargar el reporte completo. Vuelve a intentarlo.";

async function collectPages<T extends { id: string }>(
  fetchPage: (cursor: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result = await fetchPage(cursor);
    if (result.error || !result.data) throw new Error(LOAD_ERROR);
    if (result.data.length === 0) return rows;
    const nextCursor = result.data[result.data.length - 1].id;
    if (cursor !== null && nextCursor <= cursor) throw new Error(LOAD_ERROR);
    rows.push(...result.data);
    cursor = nextCursor;
    // Continue until an empty page, even when the API caps pages below PAGE_SIZE.
  }
}

export async function listReporteRevision(client: Client, range: ReporteRevisionRange): Promise<{
  rows: ReporteRevisionRow[];
  notes: ReporteRevisionNote[];
}> {
  const rows = await collectPages<ReporteRevisionRow>((cursor) => {
    let request = client.from(REVISIONES_TABLE)
      .select(REPORTE_REVISION_COLUMNS)
      .gte("created_at", range.start)
      .lt("created_at", range.endExclusive)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor !== null) request = request.gt("id", cursor);
    return request;
  });
  const notes: ReporteRevisionNote[] = [];
  for (let index = 0; index < rows.length; index += REVISION_BATCH_SIZE) {
    const ids = rows.slice(index, index + REVISION_BATCH_SIZE).map((row) => row.id);
    const batch = await collectPages<ReporteRevisionNote>((cursor) => {
      let request = client.from(NOTAS_REVISIONES_TABLE)
        .select("id, revision_id, nota, usuario, hora, created_at")
        .in("revision_id", ids)
        .order("id", { ascending: true })
        .limit(PAGE_SIZE);
      if (cursor !== null) request = request.gt("id", cursor);
      return request;
    });
    notes.push(...batch);
  }
  return { rows, notes };
}
