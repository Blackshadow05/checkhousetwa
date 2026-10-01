"use server";

import { createPrivateSession } from "@/lib/auth/session";
import type { HorarioRow, HorariosSnapshot } from "@/lib/horarios";

export async function fetchHorarios(): Promise<{ snapshot: HorariosSnapshot | null; error: string | null }> {
  try {
    const session = await createPrivateSession();
    if (!session) return { snapshot: null, error: "Inicia sesión para consultar los horarios." };
    const rows: HorarioRow[] = [];
    // The history is larger than Supabase's default response limit. Never
    // replace a complete cached snapshot with a failed or truncated read.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await session.client.from("horarios")
        .select("id,empleado,fecha,turno,es_especial")
        .order("fecha").order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    return { snapshot: { ownerId: session.usuario.id, rows, updatedAt: new Date().toISOString() }, error: null };
  } catch {
    return { snapshot: null, error: "No pudimos actualizar los horarios. Conservamos los últimos datos disponibles." };
  }
}
