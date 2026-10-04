import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MENUS_AHEAD_DAYS, MENUS_TABLE } from "@/lib/constants";
import { addDaysKey, mapMenus } from "@/lib/menus";
import type { MenuEscaneado } from "@/lib/menu-scan";
import { todayKey } from "@/lib/revisiones-display";
import { createClient } from "@/lib/supabase/server";
import type { Database, MenuDelDia } from "@/types/database";

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

type MenusClient = SupabaseClient<Database>;

function contenidoMenu(menu: MenuEscaneado) {
  return JSON.stringify({ dia_semana: menu.diaSemana, fecha: menu.fecha, comidas: menu.comidas });
}

export async function getFechasConMenu(client: MenusClient, fechas: string[]) {
  if (!fechas.length) return [];
  const { data, error } = await client.from(MENUS_TABLE).select("fecha_menu").in("fecha_menu", fechas);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.fecha_menu))];
}

export async function guardarMenus(client: MenusClient, menus: MenuEscaneado[]) {
  const { data, error } = await client
    .from(MENUS_TABLE)
    .select("id, fecha_menu")
    .in("fecha_menu", menus.map((menu) => menu.fecha));
  if (error) throw error;
  const idsPorFecha = new Map<string, string[]>();
  for (const row of data ?? []) idsPorFecha.set(row.fecha_menu, [...(idsPorFecha.get(row.fecha_menu) ?? []), row.id]);

  const nuevos = menus.filter((menu) => !idsPorFecha.has(menu.fecha));
  const existentes = menus.filter((menu) => idsPorFecha.has(menu.fecha));
  const resultados = await Promise.all([
    nuevos.length
      ? client.from(MENUS_TABLE).insert(nuevos.map((menu) => ({ fecha_menu: menu.fecha, contenido_menu: contenidoMenu(menu) })))
      : null,
    ...existentes.map((menu) =>
      client.from(MENUS_TABLE).update({ contenido_menu: contenidoMenu(menu) }).in("id", idsPorFecha.get(menu.fecha) ?? []),
    ),
  ]);
  for (const resultado of resultados) if (resultado?.error) throw resultado.error;
  return { guardados: menus.length, reemplazados: existentes.length };
}
