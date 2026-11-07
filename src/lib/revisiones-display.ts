import { fechaTexto, horaCorta } from "@/lib/fechas";
import type { InicioRevisionRow } from "@/types/database";

export const INICIO_REVISION_COLUMNS =
  "id, casita, quien_revisa, caja_fuerte, created_at, puertas_ventanas, chromecast, binoculares, trapo_binoculares, speaker, usb_speaker, controles_tv, secadora, accesorios_secadora, steamer, bolsa_vapor, plancha_cabello, bulto, sombrero, bolso_yute, evidencia_01, evidencia_02, evidencia_03, camas_ordenadas, cola_caballo, notas, nota_extra, room_move, registro_reconocimiento, pendiente, marcada_por, marcada_at" as const;

export const INICIO_LIST_LIMIT = 100;
export const INICIO_RECENT_DAYS = 2;

export const ELECTRONIC_FIELDS = [
  { key: "chromecast", label: "Chromecast" },
  { key: "speaker", label: "Speaker" },
  { key: "usb_speaker", label: "USB speaker" },
  { key: "controles_tv", label: "Controles TV" },
] as const;

export const EQUIPMENT_FIELDS = [
  { key: "secadora", label: "Secadora" },
  { key: "accesorios_secadora", label: "Accesorios secadora" },
  { key: "steamer", label: "Steamer" },
  { key: "bolsa_vapor", label: "Bolsa vapor" },
  { key: "plancha_cabello", label: "Plancha de cabello" },
  { key: "binoculares", label: "Binoculares" },
  { key: "trapo_binoculares", label: "Trapo de binoculares" },
  { key: "cola_caballo", label: "Cola de caballo" },
  { key: "bolso_yute", label: "Bolso de yute" },
  { key: "bulto", label: "Bulto" },
  { key: "sombrero", label: "Sombrero" },
  { key: "camas_ordenadas", label: "Camas ordenadas" },
] as const;

const PUERTAS_OK = new Set([
  "ok",
  "okay",
  "si",
  "sí",
  "bien",
  "todo bien",
  "todo en orden",
  "correcto",
  "cerradas",
  "cerrado",
]);

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isUpsellStatus(value: string) {
  return normalizeText(value) === "upsell";
}

export function statusAppearance(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "check in" || normalized === "check inn")
    return { tone: "sage", label: "Check in" };
  if (normalized === "check out") return { tone: "rose", label: "Check out" };
  if (isUpsellStatus(value)) return { tone: "blue", label: "Upsell" };
  if (normalized === "guardar upsell")
    return { tone: "plum", label: "Guardar Upsell" };
    if (normalized === "back to back")
      return { tone: "amber", label: "Back to Back" };
  if (normalized === "room move") return { tone: "amber", label: "Room Move" };
  if (normalized === "si" || normalized === "sí")
    return { tone: "amber", label: "Sí" };
  if (normalized === "no") return { tone: "amber", label: "No" };
  return {
    tone: "amber",
    label: value === "—" || !value ? "Sin registro" : value,
  };
}

export const HOY_BOARD_GROUPS = [
  { id: "check_in", label: "Check in", tone: "sage" },
  { id: "pendiente_guardar", label: "Pendiente de Guardar", tone: "amber" },
  { id: "upsell", label: "Upsell", tone: "blue" },
  { id: "back_to_back", label: "Back to back", tone: "amber" },
  { id: "room_move", label: "Room Move", tone: "plum" },
  { id: "check_out", label: "Check out", tone: "rose" },
] as const;

export type HoyBoardGroupId = (typeof HOY_BOARD_GROUPS)[number]["id"];

export function hoyBoardGroup(value: string): HoyBoardGroupId | null {
  const normalized = normalizeText(value);
  if (normalized === "check in" || normalized === "check inn") return "check_in";
  if (isUpsellStatus(value)) return "upsell";
  if (normalized === "back to back") return "back_to_back";
  if (normalized === "room move") return "room_move";
  if (normalized === "check out") return "check_out";
  return null;
}

const PENDIENTE_CAJA_EXCLUIDA = new Set([
  "check out",
  "guardar upsell",
  "si",
  "no",
]);

export function esEstadoPendienteDeGuardar(value: string) {
  const normalized = normalizeText(value);
  if (PENDIENTE_CAJA_EXCLUIDA.has(normalized)) return false;
  if (normalized === "check in" || normalized === "check inn") return true;
  if (normalized === "check out") return true;
  if (isUpsellStatus(value)) return true;
  if (normalized === "back to back") return true;
  if (normalized === "show room") return true;
  return false;
}

export function casitaNumber(value: string) {
  const match = value.match(/\d+/);
  return match?.[0] ?? value.trim();
}

function sortByCasita(rows: InicioRevisionRow[]) {
  return [...rows].sort((left, right) => {
    const a = Number.parseInt(casitaNumber(left.casita), 10);
    const b = Number.parseInt(casitaNumber(right.casita), 10);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return casitaNumber(left.casita).localeCompare(
        casitaNumber(right.casita),
        "es",
        { numeric: true },
      );
    }
    return a - b;
  });
}

function latestTodayByCasita(rows: InicioRevisionRow[], today: string) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (revisionDay(row.created_at) !== today) continue;
    const group = hoyBoardGroup(row.caja_fuerte);
    if (!group || group === "upsell") continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return latestByCasita;
}

export function latestUpsellsByCasita(rows: InicioRevisionRow[]) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (hoyBoardGroup(row.caja_fuerte) !== "upsell") continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return latestByCasita;
}

export function currentUpsellsFromRows(rows: InicioRevisionRow[]) {
  const latestByCasita = new Map<string, InicioRevisionRow>();
  for (const row of rows) {
    if (row.pendiente) continue;
    const number = casitaNumber(row.casita);
    if (!number || latestByCasita.has(number)) continue;
    latestByCasita.set(number, row);
  }
  return [...latestByCasita.values()].filter(
    (row) => hoyBoardGroup(row.caja_fuerte) === "upsell",
  );
}

export type HoyBoardChip = {
  row: InicioRevisionRow | null;
  casita: string;
  tone: string;
};

export type HoyBoardGroup = {
  id: string;
  label: string;
  tone: string;
  rows: HoyBoardChip[];
  sections?: HoyBoardGroup[];
};

function ultimaPorCasita(rows: readonly InicioRevisionRow[], upsells: readonly InicioRevisionRow[]) {
  const ultima = new Map<string, InicioRevisionRow>();
  const tomar = (row: InicioRevisionRow) => {
    if (row.pendiente) return;
    const number = casitaNumber(row.casita);
    if (!number) return;
    const actual = ultima.get(number);
    if (!actual || row.created_at > actual.created_at) ultima.set(number, row);
  };
  for (const row of rows) tomar(row);
  for (const row of upsells) tomar(row);
  return ultima;
}

function chips(rows: InicioRevisionRow[], tone: string): HoyBoardChip[] {
  return sortByCasita(rows).map((row) => ({ row, casita: casitaNumber(row.casita), tone }));
}

function compararCasita(left: string, right: string) {
  const a = Number.parseInt(left, 10);
  const b = Number.parseInt(right, 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return left.localeCompare(right, "es", { numeric: true });
  return a - b;
}

function ordenarChips(items: HoyBoardChip[]) {
  return [...items].sort((left, right) => compararCasita(left.casita, right.casita));
}

export function contarCasitasHoy(groups: readonly HoyBoardGroup[]) {
  return groups.reduce(
    (sum, group) => sum + group.rows.length + (group.sections?.reduce((inner, section) => inner + section.rows.length, 0) ?? 0),
    0,
  );
}


function revisionCheckInOUpsellEnEstadia(
  rows: readonly InicioRevisionRow[],
  upsells: readonly InicioRevisionRow[],
  casita: string,
  llegada: string,
  salida: string,
): InicioRevisionRow | null {
  const candidatas: InicioRevisionRow[] = [];
  const tomar = (row: InicioRevisionRow) => {
    if (row.pendiente) return;
    if (casitaNumber(row.casita) !== casita) return;
    const dia = revisionDay(row.created_at);
    if (dia === "sin-fecha" || dia < llegada || dia >= salida) return;
    const estado = hoyBoardGroup(row.caja_fuerte);
    if (estado !== "check_in" && estado !== "upsell") return;
    candidatas.push(row);
  };
  for (const row of rows) tomar(row);
  for (const row of upsells) tomar(row);
  if (!candidatas.length) return null;
  return candidatas.reduce((best, row) => (row.created_at > best.created_at ? row : best));
}

function shiftIsoDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

export function mergeInicioRevisiones(
  ...lists: readonly (readonly InicioRevisionRow[])[]
): InicioRevisionRow[] {
  const byId = new Map<string, InicioRevisionRow>();
  for (const list of lists) {
    for (const row of list) {
      if (!row.id || byId.has(row.id)) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
}

export function keepInicioRevisiones(
  rows: readonly InicioRevisionRow[],
  today: string,
  limit = INICIO_LIST_LIMIT,
  recentDays = INICIO_RECENT_DAYS,
): InicioRevisionRow[] {
  const fromDay = shiftIsoDay(today, -recentDays);
  const sorted = [...rows].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
  const kept: InicioRevisionRow[] = [];
  const seen = new Set<string>();
  for (const [index, row] of sorted.entries()) {
    if (row.id && seen.has(row.id)) continue;
    const day = revisionDay(row.created_at);
    const recent = day !== "sin-fecha" && day >= fromDay;
    if (index >= limit && !recent) continue;
    if (row.id) seen.add(row.id);
    kept.push(row);
  }
  return kept;
}

export function groupHoyCasitas(
  rows: InicioRevisionRow[],
  today: string,
  upsells: InicioRevisionRow[] = [],
  llegadas: ReadonlySet<string> | null = null,
  estadias: ReadonlyMap<string, { llegada: string; salida: string }> | null = null,
  inHouseDelDia: ReadonlySet<string> | null = null,
  llegadasHoy: ReadonlySet<string> | null = null,
  salidasHoy: ReadonlySet<string> | null = null,
  llegadasManana: ReadonlySet<string> | null = null,
): HoyBoardGroup[] {
  const latestToday = latestTodayByCasita(rows, today);
  const ultimas = ultimaPorCasita(rows, upsells);
  const enCasa = estadias ? new Set(estadias.keys()) : null;
  const conoceCasa = estadias !== null;
  const checkInHoy = new Set(
    [...latestToday.values()]
      .filter((row) => hoyBoardGroup(row.caja_fuerte) === "check_in")
      .map((row) => casitaNumber(row.casita)),
  );
  const checkOutHoy = new Set(
    [...latestToday.values()]
      .filter((row) => hoyBoardGroup(row.caja_fuerte) === "check_out")
      .map((row) => casitaNumber(row.casita)),
  );

  const checkInChips: HoyBoardChip[] = [];
  const montajesHoy: HoyBoardChip[] = [];
  const montajesManana: HoyBoardChip[] = [];
  const pendienteRows: InicioRevisionRow[] = [];
  const upsellVigentes: InicioRevisionRow[] = [];
  const ocupadas = new Set<string>();

  const marcarCheckIn = (row: InicioRevisionRow, tone: "sage" | "blue") => {
    const number = casitaNumber(row.casita);
    checkInChips.push({ row, casita: number, tone });
    ocupadas.add(number);
  };

  const marcarMontaje = (
    dest: HoyBoardChip[],
    row: InicioRevisionRow,
    tone: "sage" | "blue",
  ) => {
    const number = casitaNumber(row.casita);
    dest.push({ row, casita: number, tone });
    ocupadas.add(number);
  };

  // Montaje por llegada_fecha del memo, no por el día de la revisión.
  // Check in: sage. Upsell: blue. Revisión de ayer con llegada hoy → Check in de hoy.
  const saleHoy = (number: string) =>
    Boolean(salidasHoy?.has(number) || checkOutHoy.has(number));

  const montarPorLlegada = (
    dest: HoyBoardChip[],
    setIngresos: ReadonlySet<string> | null,
  ) => {
    if (!setIngresos) return;
    for (const number of setIngresos) {
      if (ocupadas.has(number) || saleHoy(number)) continue;
      const row = ultimas.get(number);
      if (!row) continue;
      const estado = hoyBoardGroup(row.caja_fuerte);
      if (estado === "check_in") marcarMontaje(dest, row, "sage");
      else if (estado === "upsell") marcarMontaje(dest, row, "blue");
    }
  };

  if (llegadas) {
    const setManana = llegadasManana;
    const setHoy =
      llegadasHoy ??
      (setManana
        ? new Set([...llegadas].filter((number) => !setManana.has(number)))
        : llegadas);
    montarPorLlegada(montajesHoy, setHoy);
    montarPorLlegada(montajesManana, setManana);
    for (const [number, row] of ultimas) {
      if (ocupadas.has(number) || saleHoy(number)) continue;
      if (hoyBoardGroup(row.caja_fuerte) !== "upsell") continue;
      if (checkInHoy.has(number) || llegadas.has(number)) {
        marcarCheckIn(row, "blue");
      }
    }
    for (const [number, row] of ultimas) {
      if (ocupadas.has(number)) continue;
      if (hoyBoardGroup(row.caja_fuerte) !== "upsell" || checkInHoy.has(number)) continue;
      if (conoceCasa && enCasa?.has(number)) continue;
      // Con In house Guests en el memo: Upsell sin huésped ni llegada hoy/mañana
      // no se queda en vigentes; pasa a Pendiente de Guardar.
      if (conoceCasa || inHouseDelDia !== null) continue;
      upsellVigentes.push(row);
      ocupadas.add(number);
    }
    if (inHouseDelDia) {
      for (const [number, row] of ultimas) {
        if (ocupadas.has(number)) continue;
        if (inHouseDelDia.has(number)) continue;
        if (!esEstadoPendienteDeGuardar(row.caja_fuerte)) continue;
        pendienteRows.push(row);
        ocupadas.add(number);
      }
    } else {
      for (const [number, row] of ultimas) {
        if (ocupadas.has(number)) continue;
        const estado = hoyBoardGroup(row.caja_fuerte);
        if (estado === "upsell" && (conoceCasa || inHouseDelDia !== null)) {
          pendienteRows.push(row);
          ocupadas.add(number);
          continue;
        }
        if (estado !== "check_in" || llegadas.has(number)) continue;
        pendienteRows.push(row);
        ocupadas.add(number);
      }
    }
  } else {
    for (const row of latestToday.values()) {
      if (hoyBoardGroup(row.caja_fuerte) !== "check_in") continue;
      marcarMontaje(montajesHoy, row, "sage");
    }
    for (const row of latestUpsellsByCasita(upsells).values()) {
      const number = casitaNumber(row.casita);
      if (ocupadas.has(number) || checkOutHoy.has(number)) continue;
      if (conoceCasa && enCasa?.has(number)) continue;
      upsellVigentes.push(row);
      ocupadas.add(number);
    }
  }

  const porHoy = (id: HoyBoardGroupId, tone: string) =>
    chips(
      [...latestToday.values()].filter((row) => {
        const number = casitaNumber(row.casita);
        return hoyBoardGroup(row.caja_fuerte) === id && !ocupadas.has(number);
      }),
      tone,
    );
  const back = porHoy("back_to_back", "amber");
  const room = porHoy("room_move", "plum");
  const checkout = porHoy("check_out", "rose");
  for (const chip of [...back, ...room, ...checkout]) ocupadas.add(chip.casita);

  // En ocupación: In house Guests con Check in/Upsell en la estadía actual (desde llegada).
  // No basta la última revisión si después hubo un Si u otro estado.
  const sueltas: HoyBoardChip[] = [];
  if (estadias) {
    for (const number of [...estadias.keys()].sort(compararCasita)) {
      if (ocupadas.has(number) || checkOutHoy.has(number)) continue;
      const estadia = estadias.get(number);
      if (!estadia) continue;
      const row = revisionCheckInOUpsellEnEstadia(
        rows,
        upsells,
        number,
        estadia.llegada,
        estadia.salida,
      );
      if (!row) continue;
      const estado = hoyBoardGroup(row.caja_fuerte);
      const tone = estado === "upsell" ? "blue" : "sage";
      sueltas.push({ row, casita: number, tone });
      ocupadas.add(number);
    }
  }

  const sections: HoyBoardGroup[] = [];
  if (pendienteRows.length) {
    // Check out del día (salida en memo = hoy, o revisión Check out hoy) → rose; resto amber.
    const pendienteChips: HoyBoardChip[] = sortByCasita(pendienteRows).map((row) => {
      const number = casitaNumber(row.casita);
      const esSalidaHoy =
        Boolean(salidasHoy?.has(number)) || checkOutHoy.has(number);
      return {
        row,
        casita: number,
        tone: esSalidaHoy ? "rose" : "amber",
      };
    });
    sections.push({
      id: "pendiente_guardar",
      label: "Pendiente de Guardar",
      tone: "amber",
      rows: pendienteChips,
    });
  }

  const groups: HoyBoardGroup[] = [];
  const checkIn = ordenarChips(checkInChips);
  if (checkIn.length) groups.push({ id: "check_in", label: "Check in", tone: "sage", rows: checkIn });
  const montajes = ordenarChips(montajesHoy);
  if (montajes.length) {
    groups.push({ id: "check_in_hoy", label: "Check in de hoy", tone: "sage", rows: montajes });
  }
  const manana = ordenarChips(montajesManana);
  if (manana.length) {
    groups.push({ id: "check_in_manana", label: "Check in de mañana", tone: "sage", rows: manana });
  }
  if (sueltas.length || sections.length) {
    groups.push({
      id: "ocupacion",
      label: "En ocupación",
      tone: "teal",
      rows: ordenarChips(sueltas),
      ...(sections.length ? { sections } : {}),
    });
  }
  if (upsellVigentes.length) {
    groups.push({
      id: "upsell",
      label: "Upsell",
      tone: "blue",
      rows: chips(upsellVigentes, "blue"),
    });
  }
  if (back.length) groups.push({ id: "back_to_back", label: "Back to back", tone: "amber", rows: back });
  if (room.length) groups.push({ id: "room_move", label: "Room Move", tone: "plum", rows: room });
  if (checkout.length) groups.push({ id: "check_out", label: "Check out", tone: "rose", rows: checkout });
  return groups;
}

// The home query supplies the recorded wall-clock date as YYYY-MM-DD HH:mm.
// Parse it explicitly: Safari does not consistently parse SQL-style date strings.
export function revisionDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "sin-fecha";
}

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dayLabel(day: string, today: string) {
  if (day === "sin-fecha") return "Sin fecha";
  if (day === today) return "Hoy";
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const date = new Date(`${day}T12:00:00`);
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return fechaTexto(day, today);
}

export function shortTime(value: string) {
  return horaCorta(value);
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function revisionKey(row: InicioRevisionRow, index: number) {
  return row.id || `${row.casita}-${row.created_at}-${row.quien_revisa}-${index}`;
}

export function hasRevisionValue(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== "—");
}

export function revisionEvidence(row: InicioRevisionRow) {
  return [row.evidencia_01, row.evidencia_02, row.evidencia_03].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 5,
  );
}

export function puertasVentanasOk(value: string | null) {
  if (!value) return true;
  return PUERTAS_OK.has(normalizeText(value));
}
