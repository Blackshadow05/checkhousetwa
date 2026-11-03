"use server";

import { createPrivateClient } from "@/lib/auth/session";
import { costaRicaDateTime } from "@/lib/revision-form";
import { mapOperacionMemo, type OperacionMemo } from "@/lib/operaciones-memo";
import { shiftDay } from "@/lib/revisiones-archive";

export async function fetchOperacionesMemo(): Promise<{ rows: OperacionMemo[]; error: string | null }> {
  try {
    const client = await createPrivateClient();
    const hoy = costaRicaDateTime().slice(0, 10);
    const desde = shiftDay(hoy, -2);
    const { data, error } = await client
      .from("operaciones_memo")
      .select("casita, llegada_fecha, salida_fecha, tipo, fecha_memo")
      .or(`fecha_memo.gte.${desde},salida_fecha.gte.${hoy},llegada_fecha.gte.${hoy}`)
      .limit(1000);
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
