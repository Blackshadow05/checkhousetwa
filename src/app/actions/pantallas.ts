"use server";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioSession } from "@/lib/usuarios-session";
import { validarPantalla, type PantallaInput, type PantallaReport, type PantallaStock } from "@/lib/pantallas";
import { isPantallaUrl } from "@/lib/pantallas-upload";
import { costaRicaDateTime } from "@/lib/revision-form";
import { savePantalla, type PantallaSaveResult } from "@/lib/save-pantalla";
export async function fetchPantallas() {
  try {
    const client = await createClient();
    // Read every page: replaying a truncated history would silently corrupt the board.
    const reports: PantallaReport[] = []; const stock: PantallaStock[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("reporte_pantallas").select("*").order("fecha_hora", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
      if (error) throw error;
      reports.push(...data);
      if (data.length < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("inventario_pantallas").select("ubicacion,habitacion,cantidad").order("id").range(offset, offset + 499);
      if (error) throw error;
      stock.push(...data);
      if (data.length < 500) break;
    }
    return { snapshot: { reports, stock, updatedAt: new Date().toISOString() }, error: null };
  } catch { return { snapshot: null, error: "No pudimos actualizar las pantallas. Conservamos los últimos datos disponibles." }; }
}
export async function createPantalla(input: PantallaInput): Promise<PantallaSaveResult> {
  try {
    const user = await getUsuarioSession();
    if (!user) return { saved: false, error: "Inicia sesión para guardar este registro.", warning: null };
    const error = validarPantalla(input);
    if (error) return { saved: false, error, warning: null };
    if (input.fotos.some(f => !isPantallaUrl(f.url))) return { saved: false, error: "Una foto no se cargó correctamente.", warning: null };
    return await savePantalla(await createClient(), input, user.nombre, costaRicaDateTime());
  } catch { return { saved: false, error: "No se pudo confirmar el guardado. Consulta el historial antes de volver a guardar.", warning: null }; }
}
