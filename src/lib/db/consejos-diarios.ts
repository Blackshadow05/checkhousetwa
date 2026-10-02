import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ConsejoDiario } from "@/lib/consejos-diarios";

export async function getConsejosDiarios(): Promise<ConsejoDiario[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consejos_diarios")
      .select("id, categoria, consejo")
      .order("id", { ascending: true });
    return error || !data?.length ? null : data;
  } catch {
    return null;
  }
}
