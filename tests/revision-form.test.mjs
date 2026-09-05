import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  stdin: { contents: 'export * from "./src/lib/revision-form"; export * from "./src/lib/save-revision"; export * from "./src/lib/uuid"; export * from "./src/lib/revision-photo-format"; export * from "./src/lib/revision-evidence";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", write: false,
});
const { newRevisionDraft, validateRevisionForm, revisionInsert, costaRicaDateTime, formatRevisionDateTime, evidencePhotoLimit, INVENTORY_FIELDS, BOOLEAN_FIELDS, saveRevision, createUuid, revisionPhotoEncoding, revisionPhotoDimensions, revisionPhotoExtension, isRevisionPhotoFilename, getMonthFolder, evidenceStoragePath, isEvidenceCloudinaryPath } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

function validDraft() {
  const draft = newRevisionDraft();
  Object.assign(draft.values, {
    casita: "024", quien_revisa: "  Revisor de prueba  ", created_at: "2026-09-05T08:15",
    caja_fuerte: "Check in", puertas_ventanas: "Cerradas", notas: "  Nota local  ",
  });
  for (const { key } of INVENTORY_FIELDS) draft.values[key] = BOOLEAN_FIELDS.has(key) ? "Si" : "1";
  return draft;
}

test("an untouched draft does not silently record absent items or positive checks", () => {
  const { values } = newRevisionDraft();
  assert.equal(values.caja_fuerte, "");
  assert.ok(INVENTORY_FIELDS.every(({ key }) => values[key] === ""));
  assert.equal(Object.keys(validateRevisionForm(values, 1)).length, 4);
  assert.equal(Object.keys(validateRevisionForm(values, 2)).length, 12);
});

test("drafts and photo IDs work on LAN HTTP without crypto.randomUUID", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
  try {
    const ids = Array.from({ length: 100 }, () => createUuid());
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert.ok(ids.every((id) => uuidV4.test(id)));
    assert.equal(new Set(ids).size, 100);
    assert.match(newRevisionDraft().id, uuidV4);
  } finally {
    if (original) Object.defineProperty(globalThis.crypto, "randomUUID", original);
    else delete globalThis.crypto.randomUUID;
  }
});

test("zero quantities are accepted; negative, fractional and excessive counts are rejected", () => {
  const { values } = validDraft();
  values.chromecast = "0";
  assert.deepEqual(validateRevisionForm(values, undefined, 1), {});
  for (const value of ["-1", "1.5", "100", "", "NaN"]) {
    assert.ok(validateRevisionForm({ ...values, chromecast: value }, undefined, 1).chromecast);
  }
});

test("boolean answers and movement follow the detail data model", () => {
  const { values } = validDraft();
  assert.ok(validateRevisionForm({ ...values, camas_ordenadas: "1" }, undefined, 1).camas_ordenadas);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Room Move" }, undefined, 1).room_move);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "Check in", room_move: "" }, undefined, 1).room_move, undefined);
  assert.deepEqual(validateRevisionForm({ ...values, caja_fuerte: "Room Move", room_move: "De 12 a 24" }, undefined, 1), {});
});

test("quick choices enforce each requested range and the new yes/no fields", () => {
  const { values } = validDraft();
  for (const [key, max] of Object.entries({ chromecast: 4, speaker: 3, usb_speaker: 3, controles_tv: 3, binoculares: 3, secadora: 3, accesorios_secadora: 8, steamer: 3, plancha_cabello: 2, bolso_yute: 3 })) {
    assert.equal(validateRevisionForm({ ...values, [key]: String(max) })[key], undefined);
    assert.ok(validateRevisionForm({ ...values, [key]: String(max + 1) })[key]);
  }
  for (const key of ["trapo_binoculares", "bolsa_vapor", "cola_caballo", "bulto", "sombrero"]) {
    assert.equal(validateRevisionForm({ ...values, [key]: "No" })[key], undefined);
    assert.ok(validateRevisionForm({ ...values, [key]: "1" })[key]);
    assert.equal(revisionInsert("test", { ...values, [key]: "No" }, [])[key], "No");
  }
});

test("Android uses WebP at 70%; iPhone and iPad use JPEG at 75%", () => {
  assert.deepEqual(revisionPhotoEncoding("Mozilla/5.0 (Linux; Android 14)"), { type: "image/webp", quality: 0.7 });
  for (const agent of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1"]) {
    assert.deepEqual(revisionPhotoEncoding(agent), { type: "image/jpeg", quality: 0.75 });
  }
});

test("photos fit 1200px in either orientation without stretching or upscaling", () => {
  assert.deepEqual(revisionPhotoDimensions(2400, 1600), { width: 1200, height: 800 });
  assert.deepEqual(revisionPhotoDimensions(1600, 2400), { width: 800, height: 1200 });
  assert.deepEqual(revisionPhotoDimensions(2400, 2400), { width: 1200, height: 1200 });
  assert.deepEqual(revisionPhotoDimensions(600, 400), { width: 600, height: 400 });
  assert.throws(() => revisionPhotoDimensions(0, 400));
});

test("uploads and server validation recognize both actual encoded formats", () => {
  const id = createUuid();
  for (const [type, extension] of [["image/webp", "webp"], ["image/jpeg", "jpg"]]) {
    assert.equal(revisionPhotoExtension(type), extension);
    assert.equal(isRevisionPhotoFilename(`${id}.${extension}`), true);
  }
  assert.throws(() => revisionPhotoExtension("image/png"));
  for (const filename of [`../${id}.webp`, `${id}.png`, `${id}.jpg?extra=1`, "invalid.webp"]) {
    assert.equal(isRevisionPhotoFilename(filename), false);
  }
});

test("Cloudinary evidence paths use the local Spanish month folder", () => {
  const now = new Date(2026, 8, 5, 15, 30);
  assert.equal(getMonthFolder(now), "Septiembre 2026");
  assert.equal(getMonthFolder(new Date(2026, 0, 1)), "Enero 2026");
  const stored = evidenceStoragePath("evidencia_02", 1757100000123, now);
  assert.equal(stored.folderPath, "Evidencias/Septiembre 2026");
  assert.equal(stored.publicId, "evidencia_02_1757100000123");
  assert.equal(stored.path, "Evidencias/Septiembre 2026/evidencia_02_1757100000123");
  assert.equal(isEvidenceCloudinaryPath(stored.path), true);
  assert.equal(isEvidenceCloudinaryPath("Evidencias/Septiembre 2026/evidencia_01_1757100000000"), true);
  for (const path of [
    "",
    "Evidencias/September 2026/evidencia_01_1757100000000",
    "Evidencias/Septiembre 2026/evidencia_04_1757100000000",
    "Evidencias/Septiembre 2026/../evidencia_01_1757100000000",
    "https://res.cloudinary.com/demo/image/upload/Evidencias/Septiembre 2026/evidencia_01_1757100000000",
    `${stored.path}.jpg`,
  ]) {
    assert.equal(isEvidenceCloudinaryPath(path), false);
  }
});

test("casitas are restricted to 1–50 and doors accept free text", () => {
  const { values } = validDraft();
  for (const casita of ["1", "50"]) assert.equal(validateRevisionForm({ ...values, casita }).casita, undefined);
  for (const casita of ["0", "51", "-1", ""]) assert.ok(validateRevisionForm({ ...values, casita }).casita);
  assert.equal(validateRevisionForm({ ...values, puertas_ventanas: "Ventana del baño requiere ajuste." }).puertas_ventanas, undefined);
  assert.ok(validateRevisionForm({ ...values, puertas_ventanas: "   " }).puertas_ventanas);
});

test("date validation rejects impossible days and uses Costa Rica's wall-clock time", () => {
  const { values } = validDraft();
  for (const date of ["", "2026-02-30T08:00", "2026-13-01T08:00", "2026-09-05T25:01"])
    assert.ok(validateRevisionForm({ ...values, created_at: date }).created_at);
  assert.equal(costaRicaDateTime(new Date("2026-09-05T02:30:00Z")), "2026-09-04T20:30");
  assert.match(formatRevisionDateTime("2026-09-05T08:15"), /2026/);
});

test("evidence rules depend on caja fuerte", () => {
  const { values } = validDraft();
  assert.equal(evidencePhotoLimit("Si"), 0);
  assert.equal(evidencePhotoLimit("No"), 0);
  assert.equal(evidencePhotoLimit(""), 0);
  assert.equal(evidencePhotoLimit("Check out"), 1);
  assert.equal(evidencePhotoLimit("Guardar Upsell"), 1);
  assert.equal(evidencePhotoLimit("Check in"), 3);
  assert.equal(evidencePhotoLimit("Room Move"), 3);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Check in" }, undefined, 0).evidencias);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "Check in" }, undefined, 1).evidencias, undefined);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "Check in" }, undefined, 3).evidencias, undefined);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Check out" }, undefined, 0).evidencias);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "Check out" }, undefined, 1).evidencias, undefined);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Check out" }, undefined, 2).evidencias);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Guardar Upsell" }, undefined, 3).evidencias);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "Si" }, undefined, 0).evidencias, undefined);
  assert.ok(validateRevisionForm({ ...values, caja_fuerte: "Si" }, undefined, 1).evidencias);
  assert.equal(validateRevisionForm({ ...values, caja_fuerte: "No" }, undefined, 0).evidencias, undefined);
});

test("insertion includes every detail field but excludes arbitrary client fields", () => {
  const { id, values } = validDraft();
  values.usuario_nota = "must not be inserted";
  const row = revisionInsert(id, values, ["photo1", "photo2", "photo3"]);
  assert.equal(row.casita, "24");
  assert.equal(row.quien_revisa, "Revisor de prueba");
  assert.equal(row.created_at, "2026-09-05 08:15");
  assert.equal(row.evidencia_03, "photo3");
  assert.equal(row.notas, "Nota local");
  assert.equal(row.room_move, null);
  assert.equal(row.usuario_nota, undefined);
  assert.ok(INVENTORY_FIELDS.every(({ key }) => row[key] !== undefined));
});

function fakeClient(insertResult, existingResult) {
  const operations = [];
  return {
    operations,
    from(table) {
      assert.equal(table, "revisiones_casitas");
      return {
        insert(row) { operations.push(["insert", row.id]); return { select() { return { async single() { return insertResult; } }; } }; },
        select() { return { eq(column, id) { operations.push(["lookup", column, id]); return { async single() { return existingResult; } }; } }; },
      };
    },
  };
}

test("confirmed insertion returns the saved detail", async () => {
  const { id, values } = validDraft();
  const row = revisionInsert(id, values, []);
  const client = fakeClient({ data: row, error: null });
  const result = await saveRevision(client, row);
  assert.equal(result.row.id, id);
  assert.equal(result.row.created_at, "2026-09-05 08:15");
  assert.equal(client.operations.length, 1);
});

test("a retry recovers the same ID without an update or another ID", async () => {
  const { id, values } = validDraft();
  const row = revisionInsert(id, values, []);
  const client = fakeClient({ data: null, error: { code: "23505" } }, { data: row, error: null });
  const result = await saveRevision(client, row);
  assert.equal(result.row.id, id);
  assert.deepEqual(client.operations, [["insert", id], ["lookup", "id", id]]);
});

test("permission and connectivity errors do not claim a successful save", async () => {
  const { id, values } = validDraft();
  for (const code of ["42501", "connection-error"]) {
    const result = await saveRevision(fakeClient({ data: null, error: { code } }), revisionInsert(id, values, []));
    assert.equal(result.row, null);
    assert.match(result.error, /borrador/);
  }
});
