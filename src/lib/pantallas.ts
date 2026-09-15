export const ESTADOS_PANTALLA = ["defectuosa", "en buen estado", "no hay pantalla"] as const;
export type PantallaFoto = { url: string; ubicacion: string; estado: string };
export type PantallaReport = {
  id: number; nombre_usuario: string; fecha_hora: string; numero_casita: number | null;
  fotos: PantallaFoto[]; notas: string | null; tipo?: "reporte" | "movimiento";
  origen_ubicacion: string | null; origen_habitacion: string | null;
  destino_ubicacion: string | null; destino_habitacion: string | null;
};
export type PantallaInput = Omit<PantallaReport, "id" | "nombre_usuario" | "fecha_hora">;
export type PantallaStock = { ubicacion: string; habitacion: string; cantidad: number };
export type PantallaSnapshot = { reports: PantallaReport[]; stock: PantallaStock[]; updatedAt: string };
export const CASITAS = Array.from({ length: 50 }, (_, i) => String(i + 1));
export const UBICACIONES = [...CASITAS, "bodega", "casa_verde"];
const SOLO_LIVING = new Set([5, 6, 16, 17, 18, 19, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 49, 50]);
const TRES = new Set([1, 2, 3, 4, 7, 8, 9, 10]);
const LIVING_Y_QUEEN = new Set([15, 20, 21, 22, 23, 24, 25, 38, 39, 40, 43, 46, 47, 48]);
export function habitaciones(ubicacion: string): string[] {
  if (!CASITAS.includes(ubicacion)) return [];
  const numero = Number(ubicacion);
  return SOLO_LIVING.has(numero)
    ? ["Living"]
    : TRES.has(numero)
      ? ["Living", "Cuarto Queen", "Cuarto King"]
      : LIVING_Y_QUEEN.has(numero)
        ? ["Living", "Cuarto Queen"]
        : ["Living", "Cuarto King"];
}
export function ubicacionLabel(value: string | null) {
  return value === "bodega" ? "Bodega" : value === "casa_verde" ? "Casa Verde" : value ? `Casita ${value}` : "—";
}
export function movimientoLabel(row: PantallaInput) {
  return `${ubicacionLabel(row.origen_ubicacion)}${row.origen_habitacion ? ` · ${row.origen_habitacion}` : ""} → ${ubicacionLabel(row.destino_ubicacion)}${row.destino_habitacion ? ` · ${row.destino_habitacion}` : ""}`;
}
export function validarPantalla(input: PantallaInput): string | null {
  if (!input || !["reporte", "movimiento"].includes(input.tipo ?? "") || !Array.isArray(input.fotos) || (input.notas !== null && (typeof input.notas !== "string" || input.notas.length > 4000))) return "Revisa los datos del formulario.";
  if (input.tipo === "movimiento") {
    if (input.fotos.length) return "Los movimientos no llevan fotos.";
    for (const side of ["origen", "destino"] as const) {
      const location = input[`${side}_ubicacion`] ?? "";
      const room = input[`${side}_habitacion`] ?? "";
      if (!UBICACIONES.includes(location) || (CASITAS.includes(location) ? !habitaciones(location).includes(room) : room !== "")) return `Selecciona una ubicación y habitación válidas de ${side}.`;
    }
    if (input.origen_ubicacion === input.destino_ubicacion && (input.origen_habitacion || "") === (input.destino_habitacion || "")) return "El origen y el destino deben ser diferentes.";
  } else {
    const rooms = habitaciones(String(input.numero_casita));
    if (!rooms.length || !input.fotos.length || input.fotos.length > rooms.length) return "Elige una casita y agrega al menos una foto, una por habitación.";
    if (new Set(input.fotos.map(f => f?.ubicacion)).size !== input.fotos.length) return "No repitas habitaciones en las fotos.";
    if (input.fotos.some(f => !f || !rooms.includes(f.ubicacion) || !(ESTADOS_PANTALLA as readonly string[]).includes(f.estado) || typeof f.url !== "string")) return "Elige la habitación y el estado de cada foto.";
  }
  return null;
}
// Timestamps are stored as Costa Rica wall time; never parse them in the device timezone.
export function pantallaTime(value: string) { return value.replace("T", " ").slice(0, 16); }

/** Latest report per casita, using Costa Rica wall time and ID to break ties. */
export function latestPantallaReports(reports: PantallaReport[]): PantallaReport[] {
  const latest = new Map<number, PantallaReport>();
  for (const report of reports) {
    if (report.tipo === "movimiento" || report.numero_casita === null) continue;
    const previous = latest.get(report.numero_casita);
    const date = report.fecha_hora.replace(" ", "T");
    const previousDate = previous?.fecha_hora.replace(" ", "T");
    if (!previous || date > previousDate! || (date === previousDate && report.id > previous.id)) {
      latest.set(report.numero_casita, report);
    }
  }
  // Never substitute an older report if the latest one has no photos.
  return [...latest.values()].filter(report => report.fotos?.length)
    .sort((a, b) => a.numero_casita! - b.numero_casita!);
}

export function inventarioPantallas(stock: PantallaStock[], reports: PantallaReport[]): PantallaStock[] {
  const counts = new Map<string, number>();
  const key = (location: string, room: string | null) => `${location}|${room || ""}`;
  if (!reports.length) for (const item of stock) counts.set(key(item.ubicacion, item.habitacion), item.cantidad);
  else for (const row of [...reports].sort((a, b) => a.fecha_hora.replace(" ", "T").localeCompare(b.fecha_hora.replace(" ", "T")) || a.id - b.id)) {
    if (row.tipo === "movimiento") {
      if (row.origen_ubicacion) { const k = key(row.origen_ubicacion, row.origen_habitacion); counts.set(k, Math.max(0, (counts.get(k) ?? 0) - 1)); }
      if (row.destino_ubicacion) { const k = key(row.destino_ubicacion, row.destino_habitacion); counts.set(k, (counts.get(k) ?? 0) + 1); }
    } else for (const foto of row.fotos ?? []) counts.set(key(String(row.numero_casita), foto.ubicacion), foto.estado === "no hay pantalla" ? 0 : 1);
  }
  return UBICACIONES.flatMap(ubicacion => (habitaciones(ubicacion).length ? habitaciones(ubicacion) : [""]).map(habitacion => ({ ubicacion, habitacion, cantidad: counts.get(key(ubicacion, habitacion)) ?? 0 })));
}
