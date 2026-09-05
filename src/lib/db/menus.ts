import "server-only";

import { MENUS_AHEAD_DAYS, MENUS_TABLE } from "@/lib/constants";
import { addDaysKey, mapMenus } from "@/lib/menus";
import { todayKey } from "@/lib/revisiones-display";
import { createClient } from "@/lib/supabase/server";
import type { MenuDelDia } from "@/types/database";

export async function getInicioMenus(): Promise<{
  menus: MenuDelDia[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const today = todayKey();
    const until = addDaysKey(today, MENUS_AHEAD_DAYS);
    const { data, error } = await supabase
      .from(MENUS_TABLE)
      .select("id, fecha_menu, contenido_menu")
      .gte("fecha_menu", today)
      .lte("fecha_menu", until)
      .order("fecha_menu", { ascending: true });

    if (error) {
      return { menus: [], error: error.message };
    }

    return { menus: mapMenus(data ?? []), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar los menús";

    return { menus: [], error: message };
  }
}
