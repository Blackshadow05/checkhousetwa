import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRO_EDICIONES_TABLE, REVISIONES_TABLE, NOTAS_REVISIONES_TABLE } from "@/lib/constants";
import type { RevisionActivity } from "@/lib/casitas-sin-revision";
import { createPrivateClient } from "@/lib/auth/session";
import {
  INICIO_LIST_LIMIT,
  INICIO_REVISION_COLUMNS,
  casitaNumber,
  currentUpsellsFromRows,
  isUpsellStatus,
} from "@/lib/revisiones-display";
import { todayKey } from "@/lib/revisiones-display";
import { NOTAS_REVISION_PAGE_SIZE } from "@/lib/revision-notes";
import {
  ARCHIVE_PAGE_SIZE,
  archiveSearchOrFilter,
  filterArchiveLocally,
  parseArchiveDate,
  parseArchivePeriod,
  parseReportFilter,
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

export async function listRevisionActivity(client: Client, today = todayKey()): Promise<{
  data: RevisionActivity[] | null;
  error: string | null;
}> {
  try {
    const rows: RevisionActivity[] = [];
    let cursor: string | null = null;
    for (;;) {
      let request = revisionesCasitas(client)
        .select("id, casita, created_at")
        .gte("created_at", `${shiftDay(today, -7)} 00:00:00`)
        .lt("created_at", `${shiftDay(today, 1)} 00:00:00`)
        .order("id", { ascending: true })
        .limit(500);
      if (cursor !== null) request = request.gt("id", cursor);
      const { data, error } = await request;
      if (error) return { data: null, error: error.message };
      if (!data) return { data: null, error: "No se pudo cargar la actividad de revisiones" };
      if (data.length === 0) return { data: rows, error: null };
      rows.push(...data);
      cursor = data[data.length - 1].id;
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "No se pudo cargar la actividad de revisiones",
    };
  }
}

export async function getInicioRevisiones(today = todayKey()): Promise<{
  revisiones: InicioRevisionRow[];
  upsells: InicioRevisionRow[];
  revisionActivity: RevisionActivity[] | null;
  activityError: string | null;
  error: string | null;
}> {
  try {
    const supabase = await createPrivateClient();
    const [latestResult, upsellsResult, activityResult] = await Promise.allSettled([
      listLatestRevisionesCasitas(supabase),
      listCurrentUpsells(supabase),
      listRevisionActivity(supabase, today),
    ]);
    const latest = latestResult.status === "fulfilled" ? latestResult.value : null;
    const currentUpsells = upsellsResult.status === "fulfilled" ? upsellsResult.value : null;
    const activity = activityResult.status === "fulfilled" ? activityResult.value : null;

    const revisiones = (latest?.data ?? []).map((row: RevisionCasitaInicio) =>
      mapInicioRevision(row),
    );
    const upsells =
      currentUpsells?.error || !currentUpsells?.data
        ? currentUpsellsFromRows(revisiones)
        : currentUpsells.data.map((row) => mapInicioRevision(row));

    return {
      revisiones,
      upsells,
      revisionActivity: activity?.data ?? null,
      activityError: activity?.error ?? (activity?.data ? null : "No se pudo cargar la actividad de revisiones"),
      error: latest ? latest.error?.message ?? null : "No se pudieron cargar las revisiones",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las revisiones";

    return {
      revisiones: [], upsells: [], revisionActivity: null,
      activityError: message, error: message,
    };
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
    const date = parseArchiveDate(input.date);
    const reportFilter = parseReportFilter(input.reportFilter);
    const status = input.status?.trim() ? input.status.trim() : null;
    const offset = Math.max(0, Math.min(Math.trunc(input.offset) || 0, 100_000));
    const limit = Math.max(
      1,
      Math.min(Math.trunc(input.limit) || ARCHIVE_PAGE_SIZE, 50),
    );
    const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today)
      ? input.today
      : todayKey();

    const supabase = await createPrivateClient();
    const startDay = date || (period === "all" ? "" : shiftDay(today, period === "today" ? 0 : period === "three-days" ? -2 : -6));
    const endDay = startDay ? shiftDay(date || today, 1) : "";

    if (reportFilter && reportFilter !== "caja_fuerte") {
      // Select the latest report BEFORE testing inventory, notes or reviewer.
      // Read the entire index in pages so the API row cap cannot hide a casita.
      const latest = new Map<string, string>();
      for (let page = 0; ; page += 500) {
        let indexRequest = revisionesCasitas(supabase)
          .select("id, casita, created_at")
          .order("created_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: false })
          .range(page, page + 499);
        if (startDay) indexRequest = indexRequest
          .gte("created_at", archiveCreatedAtStart(startDay))
          .lt("created_at", archiveCreatedAtStart(endDay));
        const { data, error } = await indexRequest;
        if (error) return { rows: [], total: 0, error: error.message };
        if (!data?.length) break;
        for (const row of data) {
          const key = casitaNumber(row.casita).replace(/^0+(?=\d)/, "");
          if (!latest.has(key)) latest.set(key, row.id);
        }
      }
      const ids = [...latest.values()];
      const candidates: InicioRevisionRow[] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const { data, error } = await revisionesCasitas(supabase)
          .select(INICIO_REVISION_COLUMNS).in("id", ids.slice(index, index + 100));
        if (error) return { rows: [], total: 0, error: error.message };
        candidates.push(...(data ?? []).map(mapInicioRevision));
      }
      const matches = filterArchiveLocally(candidates, search, period, status, today, reportFilter, date);
      return { rows: matches.slice(offset, offset + limit), total: matches.length, error: null };
    }
    let request = revisionesCasitas(supabase)
      .select(INICIO_REVISION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    const searchFilter = archiveSearchOrFilter(search);
    if (searchFilter) request = request.or(searchFilter);
    if (status) request = request.eq("caja_fuerte", status);
    if (startDay) {
      request = request
        .gte("created_at", archiveCreatedAtStart(startDay))
        .lt("created_at", archiveCreatedAtStart(endDay));
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

export async function getRevisionInicioById(client: Client, id: string) {
  return revisionesCasitas(client)
    .select(INICIO_REVISION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
}

export async function getLatestRevisionCasita(client: Client, casita: string) {
  return revisionesCasitas(client)
    .select(INICIO_REVISION_COLUMNS)
    .eq("casita", casita)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function listRevisionEdits(client: Client, id: string) {
  return client
    .from(REGISTRO_EDICIONES_TABLE)
    .select('id, created_at, "Usuario que Edito", Dato_anterior, Dato_nuevo')
    .like("Dato_nuevo", `[${id}]%`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
}

export async function listRevisionNotes(
  client: Client,
  id: string,
  offset = 0,
  limit = NOTAS_REVISION_PAGE_SIZE,
) {
  const start = Math.max(0, Math.trunc(offset) || 0);
  const size = Math.max(1, Math.trunc(limit) || 1);
  return client
    .from(NOTAS_REVISIONES_TABLE)
    .select("id, revision_id, nota, usuario, imagen, hora, created_at")
    .eq("revision_id", id)
    .order("hora", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(start, start + size - 1);
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
