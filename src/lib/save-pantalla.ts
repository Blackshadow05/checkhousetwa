import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { CASITAS, type PantallaInput, type PantallaReport } from "@/lib/pantallas";
type Client = SupabaseClient<Database>;
export type PantallaSaveResult = { saved: boolean; error: string | null; warning: string | null };
const missingRpc = (error: { code: string }) => error.code === "PGRST202" || error.code === "42883";
async function adjust(client: Client, location: string, room: string, quantity: number, delta: boolean) {
  const result = delta ? await client.rpc("ajustar_inventario_pantalla", { p_ubicacion: location, p_habitacion: room, p_delta: quantity }) : await client.rpc("set_inventario_pantalla", { p_ubicacion: location, p_habitacion: room, p_cantidad: quantity });
  if (!result.error) return;
  if (!missingRpc(result.error)) throw result.error;
  const { data, error } = await client.from("inventario_pantallas").select("id,cantidad").eq("ubicacion", location).eq("habitacion", room).maybeSingle();
  if (error) throw error;
  const cantidad = Math.max(0, delta ? (data?.cantidad ?? 0) + quantity : quantity);
  const write = data ? await client.from("inventario_pantallas").update({ cantidad, updated_at: new Date().toISOString() }).eq("id", data.id) : await client.from("inventario_pantallas").insert({ ubicacion: location, habitacion: room, cantidad });
  if (write.error) throw write.error;
}
export async function savePantalla(client: Client, input: PantallaInput, name: string, time: string): Promise<PantallaSaveResult> {
  const record: Omit<PantallaReport, "id"> = { tipo: input.tipo, numero_casita: input.numero_casita, fotos: input.fotos.map(f => ({ url: f.url, ubicacion: f.ubicacion, estado: f.estado, ...(f.puntos != null ? { puntos: f.puntos } : {}) })), notas: input.notas,
    origen_ubicacion: input.origen_ubicacion, origen_habitacion: input.origen_habitacion, destino_ubicacion: input.destino_ubicacion, destino_habitacion: input.destino_habitacion, nombre_usuario: name, fecha_hora: time };
  if (record.tipo === "movimiento") {
    record.numero_casita = CASITAS.includes(record.origen_ubicacion!) ? Number(record.origen_ubicacion) : CASITAS.includes(record.destino_ubicacion!) ? Number(record.destino_ubicacion) : null;
    const { error } = await client.rpc("registrar_movimiento_pantalla", {
      p_nombre_usuario: name, p_fecha_hora: time, p_notas: record.notas || "",
      p_origen_ubicacion: record.origen_ubicacion!, p_origen_habitacion: record.origen_habitacion || "",
      p_destino_ubicacion: record.destino_ubicacion!, p_destino_habitacion: record.destino_habitacion || "",
    });
    if (!error) return { saved: true, error: null, warning: null };
    if (!missingRpc(error)) return { saved: false, error: "No se pudo confirmar el movimiento. Actualiza el historial antes de reintentar.", warning: null };
  } else { record.origen_ubicacion = record.origen_habitacion = record.destino_ubicacion = record.destino_habitacion = null; }
  const insert: Database["public"]["Tables"]["reporte_pantallas"]["Insert"] = record.tipo === "movimiento" ? record : { nombre_usuario: name, fecha_hora: time, numero_casita: record.numero_casita, fotos: record.fotos, notas: record.notas, tipo: record.tipo };
  let { error } = await client.from("reporte_pantallas").insert(insert);
  if (error && record.tipo === "reporte" && ["PGRST204", "42703"].includes(error.code) && /\btipo\b/.test(error.message)) {
    const legacy = { nombre_usuario: name, fecha_hora: time, numero_casita: record.numero_casita, fotos: record.fotos, notas: record.notas };
    ({ error } = await client.from("reporte_pantallas").insert(legacy));
  }
  if (error) return { saved: false, error: "No se pudo confirmar el guardado. Actualiza el historial antes de reintentar; las fotos cargadas se conservarán en este formulario.", warning: null };
  try {
    if (record.tipo === "movimiento") {
      await adjust(client, record.origen_ubicacion!, record.origen_habitacion || "", -1, true);
      await adjust(client, record.destino_ubicacion!, record.destino_habitacion || "", 1, true);
    } else for (const photo of record.fotos) await adjust(client, String(record.numero_casita), photo.ubicacion, photo.estado === "no hay pantalla" ? 0 : 1, false);
    return { saved: true, error: null, warning: null };
  } catch { return { saved: true, error: null, warning: "Guardado. No se pudo actualizar todo el inventario; el tablero se calculará desde el historial. No vuelvas a guardar este registro." }; }
}
