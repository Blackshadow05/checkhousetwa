"use server";

import { createPrivateSession } from "@/lib/auth/session";
import { getFechasConMenu, getInicioMenus, guardarMenus } from "@/lib/db/menus";
import { fechaMenuValida, MENU_SCAN_MAX_DIAS, normalizarMenusEscaneados } from "@/lib/menu-scan";

export async function fetchInicioMenus() {
  return getInicioMenus();
}

export async function fetchFechasConMenu(fechas: unknown): Promise<{ fechas: string[]; error: string | null }> {
  try {
    const session = await createPrivateSession();
    if (!session) return { fechas: [], error: "Inicia sesión para continuar." };
    const validas = Array.isArray(fechas) ? fechas.filter(fechaMenuValida).slice(0, MENU_SCAN_MAX_DIAS) : [];
    return { fechas: await getFechasConMenu(session.client, validas), error: null };
  } catch {
    return { fechas: [], error: "No se pudo comprobar los menús guardados." };
  }
}

export async function guardarMenusEscaneados(
  menus: unknown,
): Promise<{ guardados: number; reemplazados: number; error: null } | { error: string }> {
  try {
    const session = await createPrivateSession();
    if (!session) return { error: "Inicia sesión para guardar el menú." };
    const validos = normalizarMenusEscaneados({ menus });
    if (!validos.length) return { error: "No hay días válidos para guardar." };
    return { ...(await guardarMenus(session.client, validos)), error: null };
  } catch {
    return { error: "No se pudo guardar el menú. Inténtalo de nuevo." };
  }
}
