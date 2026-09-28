"use server";

import { createPrivateClient } from "@/lib/auth/session";
import { INVENTARIO_COLUMNS, mapInventarioCasita, type InventarioCasita } from "@/lib/inventario-casitas";

export async function fetchInventarioCasitas(): Promise<{ rows: InventarioCasita[]; error: string | null }> {
  try {
    const client = await createPrivateClient();
    const { data, error } = await client.from("inventario_casitas").select(INVENTARIO_COLUMNS).order("casita").limit(500);
    if (error) return { rows: [], error: "No pudimos cargar el inventario de las casitas." };
    return { rows: (data ?? []).map(mapInventarioCasita), error: null };
  } catch {
    return { rows: [], error: "No pudimos conectar para cargar el inventario." };
  }
}
