"use server";

import { getConsejosDiarios } from "@/lib/db/consejos-diarios";

export async function fetchConsejosDiarios() {
  return getConsejosDiarios();
}
