"use server";

import { getInicioRevisiones } from "@/lib/db/revisiones-casitas";

export async function fetchInicioRevisiones() {
  return getInicioRevisiones();
}
