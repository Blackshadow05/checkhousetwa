import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { REVISIONES_TABLE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import {
  INICIO_LIST_LIMIT,
  INICIO_REVISION_COLUMNS,
  casitaNumber,
  currentUpsellsFromRows,
  isUpsellStatus,
} from "@/lib/revisiones-display";
import { todayKey } from "@/lib/revisiones-display";
import {
  ARCHIVE_PAGE_SIZE,
  archiveSearchOrFilter,
  parseArchivePeriod,
  sanitizeArchiveSearch,
  shiftDay,
  type ArchiveQuery,
} from "@/lib/revisiones-archive";
import { mapInicioRevision } from "@/lib/revisiones-map";
import type {
  Database,
  InicioRevisionRow,
  RevisionCasitaInicio,
  RevisionCasitaInsert,
  RevisionCasitaUpdate,
} from "@/types/database";

type Client = SupabaseClient<Database>;

export function revisionesCasitas(client: Client) {
  return client.from(REVISIONES_TABLE);
}

export async function countRevisionesCasitas(client: Client) {
  return revisionesCasitas(client).select("*", {
    count: "exact",
    head: true,
  });
}

export async function listRevisionesCasitas(client: Client) {
  return revisionesCasitas(client)
    .select("*")
    .order("created_at", { ascending: false });
}

export async function listLatestRevisionesCasitas(
  client: Client,
  limit = INICIO_LIST_LIMIT,
) {
  return revisionesCasitas(client)
    .select(INICIO_REVISION_COLUMNS)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
}

export async function listCurrentUpsells(client: Client) {
  const { data: upsells, error } = await revisionesCasitas(client)
    .select(INICIO_REVISION_COLUMNS)
    .eq("caja_fuerte", "Upsell")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) return { data: null as RevisionCasitaInicio[] | null, error };

  const lastUpsell = new Map<string, RevisionCasitaInicio>();
  const casitaValues: string[] = [];
  for (const row of upsells ?? []) {
    if (!isUpsellStatus(row.caja_fuerte ?? "")) continue;
    const key = casitaNumber(row.casita);
    if (!key || lastUpsell.has(key)) continue;
    lastUpsell.set(key, row);
    casitaValues.push(row.casita);
  }

  if (casitaValues.length === 0) {
    return { data: [] as RevisionCasitaInicio[], error: null };
  }

  const { data: recent, error: recentError } = await revisionesCasitas(client)
    .select("id, casita")
    .in("casita", casitaValues)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (recentError) return { data: null, error: recentError };

  const latestIdByCasita = new Map<string, string>();
  for (const row of recent ?? []) {
    const key = casitaNumber(row.casita);
    if (!key || latestIdByCasita.has(key)) continue;
    latestIdByCasita.set(key, row.id);
  }

  return {
    data: [...lastUpsell.values()].filter(
      (row) => latestIdByCasita.get(casitaNumber(row.casita)) === row.id,
    ),
    error: null,
  };
}

export async function getInicioRevisiones(): Promise<{
  revisiones: InicioRevisionRow[];
  upsells: InicioRevisionRow[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const [latest, currentUpsells] = await Promise.all([
      listLatestRevisionesCasitas(supabase),
      listCurrentUpsells(supabase),
    ]);

    if (latest.error) {
      return { revisiones: [], upsells: [], error: latest.error.message };
    }

    const revisiones = (latest.data ?? []).map((row: RevisionCasitaInicio) =>
      mapInicioRevision(row),
    );
    const upsells =
      currentUpsells.error || !currentUpsells.data
        ? currentUpsellsFromRows(revisiones)
        : currentUpsells.data.map((row) => mapInicioRevision(row));

    return { revisiones, upsells, error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las revisiones";

    return { revisiones: [], upsells: [], error: message };
  }
}

function archiveCreatedAtStart(day: string) {
  return `${day} 00:00:00`;
}

export async function getArchiveRevisiones(input: ArchiveQuery): Promise<{
  rows: InicioRevisionRow[];
  total: number;
  error: string | null;
}> {
  try {
    const search = sanitizeArchiveSearch(input.search);
    const period = parseArchivePeriod(input.period);
    const status = input.status?.trim() ? input.status.trim() : null;
    const offset = Math.max(0, Math.min(Math.trunc(input.offset) || 0, 100_000));
    const limit = Math.max(
      1,
      Math.min(Math.trunc(input.limit) || ARCHIVE_PAGE_SIZE, 50),
    );
    const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today)
      ? input.today
      : todayKey();

    const supabase = await createClient();
    let request = revisionesCasitas(supabase)
      .select(INICIO_REVISION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    const searchFilter = archiveSearchOrFilter(search);
    if (searchFilter) request = request.or(searchFilter);
    if (status) request = request.eq("caja_fuerte", status);
    if (period === "today") {
      request = request
        .gte("created_at", archiveCreatedAtStart(today))
        .lt("created_at", archiveCreatedAtStart(shiftDay(today, 1)));
    } else if (period === "week") {
      request = request
        .gte("created_at", archiveCreatedAtStart(shiftDay(today, -6)))
        .lt("created_at", archiveCreatedAtStart(shiftDay(today, 1)));
    }

    const { data, error, count } = await request;
    if (error) {
      return { rows: [], total: 0, error: error.message };
    }

    return {
      rows: (data ?? []).map((row) => mapInicioRevision(row)),
      total: count ?? 0,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las revisiones";
    return { rows: [], total: 0, error: message };
  }
}

export async function getRevisionCasitaById(client: Client, id: string) {
  return revisionesCasitas(client).select("*").eq("id", id).maybeSingle();
}

export async function insertRevisionCasita(
  client: Client,
  row: RevisionCasitaInsert
) {
  return revisionesCasitas(client).insert(row).select("*").single();
}

export async function updateRevisionCasita(
  client: Client,
  id: string,
  row: RevisionCasitaUpdate
) {
  return revisionesCasitas(client)
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
}
