import type { NotaRevisionCasita, RevisionCasita } from "@/types/database";

export type ReporteRevisionInput = { desde: string; hasta: string };
export type ReporteRevisionResult = {
  csv: string | null;
  count: number;
  error: string | null;
};
export type ReporteRevisionRange = ReporteRevisionInput & {
  start: string;
  endExclusive: string;
};

export const REPORTE_REVISION_COLUMNS =
  "id, created_at, quien_revisa, casita, caja_fuerte, puertas_ventanas, chromecast, binoculares, trapo_binoculares, speaker, usb_speaker, controles_tv, secadora, accesorios_secadora, steamer, bolsa_vapor, plancha_cabello, bulto, sombrero, bolso_yute, camas_ordenadas, cola_caballo, faltantes, room_move, notas, nota_extra, usuario_nota, hora_nota" as const;

const CSV_FIELDS = [
  ["created_at", "Fecha del reporte"],
  ["quien_revisa", "Quién revisa"],
  ["casita", "Casita"],
  ["caja_fuerte", "Caja fuerte"],
  ["puertas_ventanas", "Puertas y ventanas"],
  ["chromecast", "Chromecast"],
  ["binoculares", "Binoculares"],
  ["trapo_binoculares", "Trapo de binoculares"],
  ["speaker", "Speaker"],
  ["usb_speaker", "USB speaker"],
  ["controles_tv", "Controles TV"],
  ["secadora", "Secadora"],
  ["accesorios_secadora", "Accesorios secadora"],
  ["steamer", "Steamer"],
  ["bolsa_vapor", "Bolsa vapor"],
  ["plancha_cabello", "Plancha de cabello"],
  ["bulto", "Bulto"],
  ["sombrero", "Sombrero"],
  ["bolso_yute", "Bolso de yute"],
  ["camas_ordenadas", "Camas ordenadas"],
  ["cola_caballo", "Cola de caballo"],
  ["faltantes", "Faltantes"],
  ["room_move", "Room Move"],
  ["notas", "Notas"],
] as const satisfies ReadonlyArray<readonly [keyof RevisionCasita, string]>;

export type ReporteRevisionRow = Pick<
  RevisionCasita,
  | (typeof CSV_FIELDS)[number][0]
  | "id"
  | "nota_extra"
  | "usuario_nota"
  | "hora_nota"
>;
export type ReporteRevisionNote = Pick<
  NotaRevisionCasita,
  "id" | "revision_id" | "nota" | "usuario" | "hora" | "created_at"
>;

function parseReportDay(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value.startsWith("0000-")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

export function reporteRevisionDateRange(input: ReporteRevisionInput): {
  range: ReporteRevisionRange | null;
  error: string | null;
} {
  const desde = parseReportDay(input?.desde);
  const hasta = parseReportDay(input?.hasta);
  if (!desde || !hasta) return { range: null, error: "Selecciona las fechas del reporte." };
  if (input.desde > input.hasta) return { range: null, error: "La fecha final debe ser igual o posterior a la inicial." };
  hasta.setUTCDate(hasta.getUTCDate() + 1);
  if (hasta.getUTCFullYear() > 9999) return { range: null, error: "Selecciona una fecha final válida." };
  const nextDay = hasta.toISOString().slice(0, 10);
  // The app stores created_at as Costa Rica wall time, without a timezone.
  // Keep the same convention so a report day matches the revision screens.
  return {
    range: {
      desde: input.desde,
      hasta: input.hasta,
      start: `${input.desde} 00:00:00`,
      endExclusive: `${nextDay} 00:00:00`,
    },
    error: null,
  };
}

export function todayReporteRevision(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function nombreArchivoReporteRevision(input: ReporteRevisionInput) {
  return `revision-de-casitas_${input.desde}_${input.hasta}.csv`;
}

function csvCell(value: string | null | undefined) {
  const text = value ?? "";
  // Quoting alone does not prevent spreadsheets from executing formulas.
  const safe = /^\s*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function fechaHoraReporteRevision(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return value;
  // Revisions store local wall time; attached notes can include an explicit zone.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(value.replace(" ", "T"));
    if (!Number.isFinite(date.getTime())) return value;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")}`;
  }
  const [, year, month, day, hour, minute] = match;
  return `${day}-${month}-${year} ${hour}:${minute}`;
}

function noteText(note: { nota: string; usuario: string | null; fecha: string | null }) {
  const context = [fechaHoraReporteRevision(note.fecha), note.usuario].filter(Boolean).join(" · ");
  return context ? `[${context}] ${note.nota}` : note.nota;
}

export function csvReporteRevision(
  rows: ReporteRevisionRow[],
  notes: ReporteRevisionNote[],
) {
  const notesByRevision = new Map<string, ReporteRevisionNote[]>();
  for (const note of notes) {
    const group = notesByRevision.get(note.revision_id) ?? [];
    group.push(note);
    notesByRevision.set(note.revision_id, group);
  }
  const lines = [CSV_FIELDS.map(([, label]) => csvCell(label)).concat(csvCell("Notas extra")).join(",")];
  const ordered = [...rows].sort((a, b) =>
    (a.created_at ?? "").replace("T", " ").localeCompare((b.created_at ?? "").replace("T", " ")) ||
    a.id.localeCompare(b.id),
  );
  for (const row of ordered) {
    const extras: string[] = [];
    if (row.nota_extra) extras.push(noteText({ nota: row.nota_extra, usuario: row.usuario_nota, fecha: row.hora_nota }));
    const extraNotes = [...(notesByRevision.get(row.id) ?? [])].sort((a, b) =>
      (a.hora || a.created_at || "").localeCompare(b.hora || b.created_at || "") || a.id.localeCompare(b.id),
    );
    for (const note of extraNotes) {
      extras.push(noteText({ nota: note.nota, usuario: note.usuario, fecha: note.hora || note.created_at }));
    }
    lines.push(CSV_FIELDS.map(([field]) => csvCell(field === "created_at" ? fechaHoraReporteRevision(row[field]) : row[field])).concat(csvCell(extras.join("\n\n"))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
