import assert from "node:assert/strict";
import test from "node:test";
import { recognitionDetailItems } from "../src/lib/revision-recognition-detail";
import { mapInicioRevision, applyRealtimeChange } from "../src/lib/revisiones-map";
import { INICIO_REVISION_COLUMNS } from "../src/lib/revisiones-display";
import type { RevisionCasitaInicio } from "../src/types/database";

const log = {
  version: 1,
  modelo: "yolo26n-v8",
  articulos: [
    { campo: "chromecast", detectado: 0, valor_guardado: "2", inventario: 5, estado_escaneo: "revisar" },
    { campo: "speaker", detectado: 1, valor_guardado: "2", inventario: 1, estado_escaneo: "identificado" },
    { campo: "bulto", detectado: 1, valor_guardado: "No" },
    { campo: "secadora", detectado: null, valor_guardado: "1" },
    { campo: "usb_speaker", detectado: 0, valor_guardado: "1" },
    { campo: "camas_ordenadas", detectado: 0, valor_guardado: "Si" },
  ],
};

test("shows doubtful detections and changed correct items with only recorded values", () => {
  const items = recognitionDetailItems(log);
  assert.deepEqual(items.find(item => item.campo === "chromecast"), { campo: "chromecast", detectado: "0", guardado: "2" });
  assert.deepEqual(items.find(item => item.campo === "speaker"), { campo: "speaker", detectado: "1", guardado: "2" });
  assert.deepEqual(items.find(item => item.campo === "bulto"), { campo: "bulto", detectado: "Sí", guardado: "No" });
  assert.deepEqual(items.find(item => item.campo === "secadora"), { campo: "secadora", detectado: "Sin dato", guardado: "1" });
  assert.equal(items.length, 4);
  assert.ok(items.every(item => Object.keys(item).length === 3));
});

test("old reviews and malformed or unsupported data are safely omitted", () => {
  for (const value of [null, undefined, [], { version: 2, articulos: log.articulos }, { version: 1, articulos: {} }]) {
    assert.deepEqual(recognitionDetailItems(value), []);
  }
  assert.deepEqual(recognitionDetailItems({ version: 1, articulos: [null,
    { campo: "speaker", detectado: -1, valor_guardado: "2" },
    { campo: "secadora", detectado: 1, valor_guardado: "texto" },
    { campo: "bulto", detectado: 1, valor_guardado: "1" },
    { campo: "unknown", detectado: 1, valor_guardado: "2" },
  ] }), []);
});

test("queries, initial mapping, realtime and cached rows keep the original saved values", () => {
  assert.ok(INICIO_REVISION_COLUMNS.split(", ").includes("registro_reconocimiento"));
  const row: RevisionCasitaInicio = {
    id: "test", casita: "1", quien_revisa: "Prueba", created_at: "2026-10-01T21:00:00Z",
    chromecast: "99", registro_reconocimiento: log, caja_fuerte: "Check in",
    puertas_ventanas: null, binoculares: null, trapo_binoculares: null,
    speaker: null, usb_speaker: null, controles_tv: null, secadora: null,
    accesorios_secadora: null, steamer: null, bolsa_vapor: null, plancha_cabello: null,
    bulto: null, sombrero: null, bolso_yute: null, evidencia_01: null,
    evidencia_02: null, evidencia_03: null, camas_ordenadas: null, cola_caballo: null,
    notas: null, nota_extra: null, room_move: null,
  };
  const mapped = mapInicioRevision(row);
  assert.equal(mapped.reconocimiento?.find(item => item.campo === "chromecast")?.guardado, "2");
  assert.deepEqual(JSON.parse(JSON.stringify(mapped)).reconocimiento, mapped.reconocimiento);
  assert.deepEqual(applyRealtimeChange([], "INSERT", row, null)[0].reconocimiento, mapped.reconocimiento);
  assert.ok(!JSON.stringify(mapped).includes("inventario"));
});
