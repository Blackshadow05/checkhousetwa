import { INICIO_LIST_LIMIT } from "@/lib/revisiones-display";
import type {
  InicioRevisionRow,
  RevisionCasita,
  RevisionCasitaInicio,
} from "@/types/database";

function formatCreatedAt(value: string | null): string {
  if (!value) return "—";
  const normalized = value.replace("T", " ");
  const [date, time] = normalized.split(" ");
  if (!date || !time) return value;
  return `${date} ${time.slice(0, 5)}`;
}

function asText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function mapInicioRevision(row: RevisionCasitaInicio): InicioRevisionRow {
  return {
    id: row.id,
    casita: row.casita,
    quien_revisa: row.quien_revisa,
    caja_fuerte: row.caja_fuerte ?? "—",
    created_at: formatCreatedAt(row.created_at),
    puertas_ventanas: asText(row.puertas_ventanas),
    chromecast: asText(row.chromecast),
    binoculares: asText(row.binoculares),
    trapo_binoculares: asText(row.trapo_binoculares),
    speaker: asText(row.speaker),
    usb_speaker: asText(row.usb_speaker),
    controles_tv: asText(row.controles_tv),
    secadora: asText(row.secadora),
    accesorios_secadora: asText(row.accesorios_secadora),
    steamer: asText(row.steamer),
    bolsa_vapor: asText(row.bolsa_vapor),
    plancha_cabello: asText(row.plancha_cabello),
    bulto: asText(row.bulto),
    sombrero: asText(row.sombrero),
    bolso_yute: asText(row.bolso_yute),
    evidencia_01: asText(row.evidencia_01),
    evidencia_02: asText(row.evidencia_02),
    evidencia_03: asText(row.evidencia_03),
    camas_ordenadas: asText(row.camas_ordenadas),
    cola_caballo: asText(row.cola_caballo),
    notas: asText(row.notas),
    room_move: asText(row.room_move),
  };
}

function rowId(record: { id?: string } | Record<string, unknown> | null) {
  if (!record || typeof record !== "object") return null;
  if (!("id" in record) || typeof record.id !== "string" || !record.id) {
    return null;
  }
  return record.id;
}

export function applyRealtimeChange(
  rows: InicioRevisionRow[],
  eventType: "INSERT" | "UPDATE" | "DELETE",
  nextRecord: RevisionCasita | Record<string, unknown> | null,
  previousRecord: { id?: string } | Record<string, unknown> | null,
): InicioRevisionRow[] {
  if (eventType === "DELETE") {
    const id = rowId(previousRecord) ?? rowId(nextRecord);
    if (!id) return rows;
    return rows.filter((row) => row.id !== id);
  }
  const id = rowId(nextRecord);
  if (!id || !nextRecord || typeof nextRecord !== "object") return rows;
  const mapped = mapInicioRevision(nextRecord as RevisionCasitaInicio);
  const merged = [mapped, ...rows.filter((row) => row.id !== mapped.id)].sort(
    (left, right) => right.created_at.localeCompare(left.created_at),
  );
  return merged.slice(0, INICIO_LIST_LIMIT);
}
