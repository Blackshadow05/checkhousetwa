"use server";

import { createPrivateClient } from "@/lib/auth/session";
import { mapOperacionMemo, type OperacionMemo } from "@/lib/operaciones-memo";

export async function fetchOperacionesMemo(): Promise<{ rows: OperacionMemo[]; error: string | null }> {
  try {
    const client = await createPrivateClient();
    const { data, error } = await client
      .from("operaciones_memo")
      .select("casita, llegada_fecha, salida_fecha")
      .limit(500);
    if (error) return { rows: [], error: "No pudimos cargar las llegadas y salidas." };
    return {
      rows: (data ?? []).flatMap((row) => {
        const mapped = mapOperacionMemo(row);
        return mapped ? [mapped] : [];
      }),
      error: null,
    };
  } catch {
    return { rows: [], error: "No pudimos conectar para cargar las llegadas y salidas." };
  }
}
