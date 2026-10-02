"use server";

import { createPrivateClient } from "@/lib/auth/session";
import { listReporteRevision } from "@/lib/db/reportes-revision";
import {
  csvReporteRevision,
  reporteRevisionDateRange,
  type ReporteRevisionInput,
  type ReporteRevisionResult,
} from "@/lib/reportes-revision";

export async function fetchReporteRevision(input: ReporteRevisionInput): Promise<ReporteRevisionResult> {
  const { range, error } = reporteRevisionDateRange(input);
  if (!range) return { csv: null, count: 0, error };
  try {
    const client = await createPrivateClient();
    const { rows, notes } = await listReporteRevision(client, range);
    return { csv: csvReporteRevision(rows, notes), count: rows.length, error: null };
  } catch {
    return { csv: null, count: 0, error: "No pudimos cargar el reporte completo. Revisa tu conexión e inténtalo de nuevo." };
  }
}
