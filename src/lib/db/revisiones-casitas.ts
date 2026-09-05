import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { REVISIONES_TABLE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import {
  INICIO_LIST_LIMIT,
  INICIO_REVISION_COLUMNS,
} from "@/lib/revisiones-display";
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

export async function getInicioRevisiones(): Promise<{
  revisiones: InicioRevisionRow[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await listLatestRevisionesCasitas(supabase);

    if (error) {
      return { revisiones: [], error: error.message };
    }

    const revisiones = (data ?? []).map((row: RevisionCasitaInicio) =>
      mapInicioRevision(row),
    );

    return { revisiones, error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las revisiones";

    return { revisiones: [], error: message };
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
