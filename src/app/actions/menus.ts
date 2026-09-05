"use server";

import { getInicioMenus } from "@/lib/db/menus";

export async function fetchInicioMenus() {
  return getInicioMenus();
}
