import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { listReporteRevision } from "../src/lib/db/reportes-revision";
import {
  csvReporteRevision,
  fechaHoraReporteRevision,
  reporteRevisionDateRange,
  todayReporteRevision,
  type ReporteRevisionRow,
  type ReporteRevisionNote,
} from "../src/lib/reportes-revision";
import type { Database } from "../src/types/database";

const range = reporteRevisionDateRange({ desde: "2026-09-01", hasta: "2026-09-30" }).range!;
function revision(id: string, values: Partial<ReporteRevisionRow> = {}): ReporteRevisionRow {
  return {
    id, created_at: "2026-09-15T11:30:00", quien_revisa: "Ana", casita: "1",
    caja_fuerte: "Si", puertas_ventanas: "Bien", chromecast: "1", binoculares: "1",
    trapo_binoculares: "Si", speaker: "1", usb_speaker: "1", controles_tv: "2",
    secadora: "1", accesorios_secadora: "3", steamer: "1", bolsa_vapor: "Si",
    plancha_cabello: "1", bulto: "Si", sombrero: "Si", bolso_yute: "1",
    camas_ordenadas: "Si", cola_caballo: "No", faltantes: null, room_move: null,
    notas: null, nota_extra: null, usuario_nota: null, hora_nota: null, ...values,
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  const text = csv.replace(/^\uFEFF/u, "");
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if (character === "\r" && text[index + 1] === "\n" && !quoted) {
      row.push(value); rows.push(row); row = []; value = ""; index++;
    } else value += character;
  }
  return rows;
}

test("date range includes both selected days and crosses month/year/leap boundaries", () => {
  assert.equal(range.start, "2026-09-01 00:00:00");
  assert.equal(range.endExclusive, "2026-10-01 00:00:00");
  assert.equal(reporteRevisionDateRange({ desde: "2024-02-29", hasta: "2024-02-29" }).range?.endExclusive, "2024-03-01 00:00:00");
  assert.equal(reporteRevisionDateRange({ desde: "2026-12-31", hasta: "2026-12-31" }).range?.endExclusive, "2027-01-01 00:00:00");
});

test("invalid dates and reverse ranges are rejected", () => {
  for (const desde of ["2026-02-29", "2026-04-31", "2026-1-01", "0000-01-01", "garbage", ""]) {
    const result = reporteRevisionDateRange({ desde, hasta: "2026-10-01" });
    assert.equal(result.range, null); assert.ok(result.error);
  }
  assert.equal(reporteRevisionDateRange({ desde: "2026-10-02", hasta: "2026-10-01" }).range, null);
  assert.equal(reporteRevisionDateRange({ desde: "9999-12-31", hasta: "9999-12-31" }).range, null);
});

test("today follows Costa Rica even when UTC already has a new date", () => {
  assert.equal(todayReporteRevision(new Date("2026-10-01T05:59:59Z")), "2026-09-30");
  assert.equal(todayReporteRevision(new Date("2026-10-01T06:00:00Z")), "2026-10-01");
});

test("CSV round-trips accents, commas, quotes, multiline notes and every accessory", () => {
  const csv = csvReporteRevision([revision("a", { notas: 'Revisó José, dijo "listo"\nSegunda línea' })], []);
  assert.ok(csv.startsWith("\uFEFF"));
  const [headers, row] = parseCsv(csv);
  assert.equal(row[headers.indexOf("Notas")], 'Revisó José, dijo "listo"\nSegunda línea');
  assert.equal(row[headers.indexOf("Fecha del reporte")], "15-09-2026 11:30");
  for (const label of ["Chromecast", "USB speaker", "Accesorios secadora", "Camas ordenadas", "Cola de caballo", "Faltantes", "Room Move", "Notas extra"]) assert.ok(headers.includes(label));
  assert.equal(headers.length, row.length);
});

test("report timestamps use day-month-year and 24-hour minutes without shifting local time", () => {
  assert.equal(fechaHoraReporteRevision("2026-09-28T09:30:45.123456"), "28-09-2026 09:30");
  assert.equal(fechaHoraReporteRevision("2026-09-28 09:30:00"), "28-09-2026 09:30");
  assert.equal(fechaHoraReporteRevision("2026-09-28T15:30:00+00:00"), "28-09-2026 09:30");
  assert.equal(fechaHoraReporteRevision("2026-09-29T05:30:00Z"), "28-09-2026 23:30");
  assert.equal(fechaHoraReporteRevision("2026-09-28T00:00:00-06:00"), "28-09-2026 00:00");
  assert.equal(fechaHoraReporteRevision(null), "");
});

test("CSV neutralizes formulas including whitespace and control-prefix variants", () => {
  for (const notas of ["=1+1", "+cmd", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1"]) {
    const [headers, row] = parseCsv(csvReporteRevision([revision("a", { notas })], []));
    assert.equal(row[headers.indexOf("Notas")], `'${notas}`);
  }
});

test("all legacy and attached extra notes remain on one revision row in chronological order", () => {
  const row = revision("a", { nota_extra: "Nota antigua", usuario_nota: "Ana", hora_nota: "2026-09-15 11:31:00" });
  const notes: ReporteRevisionNote[] = [
    { id: "c", revision_id: "a", nota: "Nota final", usuario: "José", hora: "2026-10-01 00:01:00", created_at: null },
    { id: "b", revision_id: "a", nota: 'Nota, "segunda"\nDetalle', usuario: "Luis", hora: "2026-09-15 12:00:00", created_at: null },
  ];
  const [headers, values] = parseCsv(csvReporteRevision([row], notes));
  const extras = values[headers.indexOf("Notas extra")];
  assert.ok(extras.includes("15-09-2026 11:31"));
  assert.ok(extras.includes("01-10-2026 00:01"));
  assert.ok(extras.includes("Nota antigua")); assert.ok(extras.includes('Nota, "segunda"\nDetalle'));
  assert.ok(extras.includes("Nota final")); assert.ok(extras.indexOf("Nota antigua") < extras.indexOf("segunda"));
  assert.ok(extras.indexOf("segunda") < extras.indexOf("Nota final"));
});

function mockClient(rows: ReporteRevisionRow[], notes: ReporteRevisionNote[], failAt = Infinity) {
  const calls: URL[] = [];
  const client = createClient<Database>("https://reports.example", "test-publishable", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); calls.push(url);
      if (calls.length >= failAt) return new Response(JSON.stringify({ message: "Unavailable" }), { status: 500, headers: { "content-type": "application/json" } });
      const isNotes = url.pathname.endsWith("/notas_revisiones_casitas");
      let data: Array<ReporteRevisionRow | ReporteRevisionNote> = isNotes ? notes : rows;
      const cursor = url.searchParams.get("id")?.replace(/^gt\./, "");
      if (cursor) data = data.filter((row) => row.id > cursor);
      if (isNotes) {
        const ids = url.searchParams.get("revision_id")?.slice(4, -1).split(",") ?? [];
        data = data.filter((row) => "revision_id" in row && ids.includes(row.revision_id));
      } else {
        const dates = url.searchParams.getAll("created_at");
        const start = dates.find((value) => value.startsWith("gte."))?.slice(4) ?? "";
        const end = dates.find((value) => value.startsWith("lt."))?.slice(3) ?? "";
        data = data.filter((row) => "casita" in row && (row.created_at ?? "").replace("T", " ") >= start && (row.created_at ?? "").replace("T", " ") < end);
      }
      // Simulate an API limit lower than the requested 500 rows.
      data = data.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, isNotes ? 37 : 75);
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    } },
  });
  return { client, calls };
}

test("queries include every revision and note across API caps and ID batches", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => revision(String(index).padStart(5, "0")));
  rows.push(revision("outside", { created_at: "2026-10-01T00:00:00" }));
  rows.push(revision("start", { created_at: "2026-09-01T00:00:00" }));
  rows.push(revision("end", { created_at: "2026-09-30T23:59:59.999999" }));
  const notes = Array.from({ length: 501 }, (_, index): ReporteRevisionNote => ({ id: String(index).padStart(5, "0"), revision_id: "00000", nota: `Nota ${index}`, usuario: "Ana", hora: null, created_at: null }));
  notes.push({ id: "last", revision_id: "01000", nota: "Última casita", usuario: null, hora: null, created_at: null });
  const { client, calls } = mockClient(rows, notes);
  const result = await listReporteRevision(client, range);
  assert.equal(result.rows.length, 1003); assert.equal(result.notes.length, 502);
  assert.ok(result.rows.some((row) => row.id === "start")); assert.ok(result.rows.some((row) => row.id === "end"));
  assert.ok(!result.rows.some((row) => row.id === "outside"));
  assert.ok(result.notes.some((row) => row.id === "last"));
  assert.ok(calls.filter((url) => url.pathname.endsWith("/revisiones_casitas")).length > 2);
  assert.ok(calls.every((url) => url.searchParams.get("order") === "id.asc"));
});

test("failure after a successful page rejects the entire report", async () => {
  const rows = Array.from({ length: 200 }, (_, index) => revision(String(index).padStart(5, "0")));
  const { client } = mockClient(rows, [], 2);
  await assert.rejects(listReporteRevision(client, range), /reporte completo/);
});
