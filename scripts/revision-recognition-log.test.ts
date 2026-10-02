import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { ARTICULOS_CLASES } from "../src/lib/articulos-model";
import { valoresDetectados, type InventarioCasita } from "../src/lib/inventario-casitas";
import { newRevisionDraft, revisionInsert, type RevisionFormValues } from "../src/lib/revision-form";
import { parseRevisionRecognition, registroReconocimiento, type RevisionRecognitionInput } from "../src/lib/revision-recognition-log";
import { saveRevision } from "../src/lib/save-revision";
import { createRevision } from "../src/app/actions/revisiones";
import type { Database, RevisionCasitaInsert } from "../src/types/database";

const at = "2026-10-01T20:00:00.000Z";
const id = "e8223c0e-06da-4fe0-bb78-ae17ab9146d8";
const photo = "Evidencias/Octubre 2026/evidencia_01_1790870400000";
const counts = Object.fromEntries(ARTICULOS_CLASES.map(key => [key, 1])) as Record<(typeof ARTICULOS_CLASES)[number], number>;
const scan: RevisionRecognitionInput = { detectados: counts, at, model: "yolo26n-v8" };
const stock: InventarioCasita = { casita: 1, cantidades: { ...counts, usb_speaker: 3 } };
function values(overrides: Partial<RevisionFormValues> = {}): RevisionFormValues {
  return {
    ...newRevisionDraft().values, ...valoresDetectados(counts), casita: "1", quien_revisa: "Prueba local",
    caja_fuerte: "Check out", puertas_ventanas: "Bien", usb_speaker: "2", camas_ordenadas: "Si", ...overrides,
  };
}

test("retains a scan failure after manual correction and separates an edit to an originally correct count", () => {
  const inventory = { ...stock, cantidades: { ...stock.cantidades, chromecast: 2 } };
  const log = registroReconocimiento(values({ chromecast: "2", speaker: "2" }), scan, inventory, at);
  assert.deepEqual(log.articulos, [
    { campo: "chromecast", detectado: 1, inventario: 2, valor_escaneo: "1", valor_guardado: "2", estado_escaneo: "revisar", modificado_por_usuario: true },
    { campo: "speaker", detectado: 1, inventario: 1, valor_escaneo: "1", valor_guardado: "2", estado_escaneo: "identificado", modificado_por_usuario: true },
  ]);
  assert.equal(log.modelo, "yolo26n-v8");
});

test("records uncorrected failures and Boolean corrections; never includes USB speaker or beds", () => {
  const inventory = { ...stock, cantidades: { ...stock.cantidades, binoculares: 2 } };
  const log = registroReconocimiento(values({ cola_caballo: "No", camas_ordenadas: "No", usb_speaker: "0" }), scan, inventory, at);
  assert.deepEqual(log.articulos.map(item => item.campo), ["binoculares", "cola_caballo"]);
  assert.equal(log.articulos[0].modificado_por_usuario, false);
  assert.equal(log.articulos[1].valor_escaneo, "Si");
  assert.equal(log.articulos[1].valor_guardado, "No");
});

test("uses the actual automatically filled value for clamped counts and does not invent inventory checks", () => {
  const clampedScan = { ...scan, detectados: { ...counts, plancha_cabello: 3 } };
  const inventory = { ...stock, cantidades: { ...stock.cantidades, plancha_cabello: 3 } };
  assert.deepEqual(registroReconocimiento(values({ plancha_cabello: "2" }), clampedScan, inventory, at).articulos, []);
  const log = registroReconocimiento(values({ speaker: "2" }), scan, null, at);
  assert.equal(log.inventario_disponible, false);
  assert.deepEqual(log.articulos.map(item => item.estado_escaneo), ["sin_inventario"]);
});

test("validates recognition metadata and strips excluded and unexpected properties", () => {
  const parsed = parseRevisionRecognition({ ...scan, detectados: { ...counts, camas_ordenadas: 8, usb_speaker: 9, admin: true }, extra: true });
  assert.deepEqual(parsed, scan);
  for (const count of [-1, 1.1, "1", Infinity, 25_201]) {
    assert.equal(parseRevisionRecognition({ ...scan, detectados: { chromecast: count } }), null);
  }
  assert.equal(parseRevisionRecognition({ ...scan, at: "invalid" }), null);
  assert.equal(parseRevisionRecognition({ ...scan, detectados: {} }), null);
  assert.equal(revisionInsert(id, values(), [photo]).registro_reconocimiento, null);
});

type TestState = { written: RevisionCasitaInsert[]; inventoryError?: boolean; stock: InventarioCasita };
const state: TestState = { written: [], stock };
const client = createClient<Database>("https://local-test.supabase.co", "test-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (request, options) => {
    const url = new URL(String(request));
    if (url.pathname.endsWith("/inventario_casitas")) {
      assert.equal(url.searchParams.get("casita"), "eq.1");
      if (state.inventoryError) return new Response(JSON.stringify({ code: "XX000", message: "test error" }), { status: 500 });
      return new Response(JSON.stringify({ casita: 1, ...state.stock.cantidades }), { headers: { "Content-Type": "application/json" } });
    }
    assert.equal(options?.method, "POST");
    assert.ok(url.pathname.endsWith("/revisiones_casitas"));
    const row = JSON.parse(String(options.body)) as RevisionCasitaInsert;
    state.written.push(row);
    return new Response(JSON.stringify(row), { status: 201, headers: { "Content-Type": "application/json" } });
  } },
});
(globalThis as typeof globalThis & { __recognitionTestClient: typeof client }).__recognitionTestClient = client;

test("JSON survives the real Supabase client insert and server action; manual saves remain supported", async () => {
  state.written = [];
  state.stock = { ...stock, cantidades: { ...stock.cantidades, chromecast: 2 } };
  const result = await createRevision({ id, values: values({ chromecast: "2", speaker: "2" }), photos: [photo], reconocimiento: scan });
  assert.equal(result.error, null);
  assert.ok(result.row);
  const log = state.written[0].registro_reconocimiento as { articulos: { campo: string; estado_escaneo: string }[] };
  assert.deepEqual(log.articulos.map(item => [item.campo, item.estado_escaneo]), [["chromecast", "revisar"], ["speaker", "identificado"]]);
  const direct = await saveRevision(client, revisionInsert(id, values(), [photo]));
  assert.equal(direct.error, null);
  assert.equal(state.written.at(-1)?.registro_reconocimiento, null);
});

test("rejects malformed scans or failed inventory checks before insertion", async () => {
  state.written = [];
  state.inventoryError = true;
  const failed = await createRevision({ id, values: values(), photos: [photo], reconocimiento: scan });
  assert.ok(failed.error);
  assert.equal(state.written.length, 0);
  state.inventoryError = false;
  const invalid = await createRevision({ id, values: values(), photos: [photo], reconocimiento: { ...scan, detectados: { chromecast: -1 } } });
  assert.ok(invalid.error);
  assert.equal(state.written.length, 0);
});
