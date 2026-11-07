import assert from "node:assert/strict";
import { REVISION_EDIT_FIELDS } from "../src/lib/revision-edit.ts";
import { puedeEditarRevision } from "../src/lib/revision-edit.ts";
import {
  addEvidenceDraftItems,
  canAddEvidenceDraft,
  compactEvidenceSlots,
  evidenceDraftCancelPlan,
  evidenceDraftFromRow,
  evidenceDraftSaveFailurePlan,
  evidenceDraftSlots,
  evidencePathsFromSlots,
  evidenceSlotsFromRow,
  markEvidenceDraftUploaded,
  parseEvidenceEditPayload,
  puedeEditarEvidencias,
  removeEvidenceDraftItem,
  retainedEvidencePaths,
  revisionEvidenceEditDecision,
  sameEvidenceSlots,
  snapshotEvidenceDraft,
  storagePathsMustKeep,
  uploadsSafeToDiscardAfterSaveFailure,
  uploadsSafeToDiscardOnCancel,
  validateRevisionEvidencePhotos,
} from "../src/lib/revision-evidence-edit.ts";

const PATH_A = "Evidencias/Noviembre 2026/evidencia_01_1730000000000";
const PATH_B = "Evidencias/Noviembre 2026/evidencia_02_1730000000001";
const PATH_C = "Evidencias/Noviembre 2026/evidencia_03_1730000000002";
const PATH_NEW = "Evidencias/Noviembre 2026/evidencia_01_1730000000999";

function photo(id) {
  return { id, name: `${id}.jpg`, blob: new Blob(["x"], { type: "image/jpeg" }) };
}

const tests = [
  {
    name: "conserva las fotos que no se cambian",
    run() {
      const current = compactEvidenceSlots([PATH_A, PATH_B]);
      const next = compactEvidenceSlots([PATH_A, PATH_B]);
      assert.equal(revisionEvidenceEditDecision(current, current, next), "noop");
      assert.deepEqual(retainedEvidencePaths(current, next), [PATH_A, PATH_B]);
      assert.deepEqual(storagePathsMustKeep(current, next), [PATH_A, PATH_B]);
    },
  },
  {
    name: "añade una foto sin perder las actuales",
    run() {
      const current = compactEvidenceSlots([PATH_A]);
      const next = compactEvidenceSlots([PATH_A, PATH_NEW]);
      assert.equal(revisionEvidenceEditDecision(current, current, next), "apply");
      assert.deepEqual(evidencePathsFromSlots(next), [PATH_A, PATH_NEW]);
      assert.deepEqual(retainedEvidencePaths(current, next), [PATH_A]);
      assert.deepEqual(storagePathsMustKeep(current, next), [PATH_A]);
    },
  },
  {
    name: "quita una foto y compacta el resto en orden",
    run() {
      const current = compactEvidenceSlots([PATH_A, PATH_B, PATH_C]);
      const next = compactEvidenceSlots([PATH_B, PATH_C]);
      assert.equal(next.evidencia_01, PATH_B);
      assert.equal(next.evidencia_02, PATH_C);
      assert.equal(next.evidencia_03, null);
      assert.deepEqual(storagePathsMustKeep(current, next), [PATH_A, PATH_B, PATH_C]);
    },
  },
  {
    name: "cancelar restaura el borrador original y solo descarta fotos nuevas",
    run() {
      const original = evidenceDraftFromRow({ evidencia_01: PATH_A, evidencia_02: PATH_B, evidencia_03: null });
      const snapshot = snapshotEvidenceDraft(original);
      const added = addEvidenceDraftItems(original, [photo("nueva-1")], "Check in");
      const removed = removeEvidenceDraftItem(added.items, original[0].id);
      const plan = evidenceDraftCancelPlan(snapshot, removed.items);
      assert.deepEqual(
        plan.restored.map((item) => item.kind === "existing" ? item.path : item.id),
        [PATH_A, PATH_B],
      );
      assert.equal(plan.discard.length, 1);
      assert.equal(plan.discard[0].id, "nueva-1");
    },
  },
  {
    name: "si el guardado falla no se marcan fotos previas para borrar",
    run() {
      const original = compactEvidenceSlots([PATH_A, PATH_B]);
      const draft = evidenceDraftFromRow(original);
      const withNew = addEvidenceDraftItems(draft, [photo("nueva-2")], "Check in");
      const marked = markEvidenceDraftUploaded(withNew.items, "nueva-2", PATH_NEW);
      const plan = evidenceDraftSaveFailurePlan(draft, marked);
      assert.deepEqual(plan.discard, []);
      assert.deepEqual(plan.preexisting, [PATH_A, PATH_B]);
      assert.deepEqual(uploadsSafeToDiscardAfterSaveFailure(original, [PATH_NEW]), []);
      assert.ok(plan.keepDraft.some((item) => item.kind === "existing" && item.path === PATH_A));
    },
  },
  {
    name: "cancelar no borra rutas de storage ya referenciadas",
    run() {
      const original = compactEvidenceSlots([PATH_A]);
      assert.deepEqual(uploadsSafeToDiscardOnCancel(original, [PATH_A, PATH_NEW]), [PATH_NEW]);
    },
  },
  {
    name: "quien no es autor ni admin no puede editar evidencias",
    run() {
      const autor = { nombre: "Esteban", rol: "user" };
      const otro = { nombre: "Ana", rol: "user" };
      assert.equal(puedeEditarRevision(autor, "Esteban"), true);
      assert.equal(puedeEditarEvidencias(otro, "Esteban"), false);
      assert.equal(puedeEditarEvidencias(null, "Esteban"), false);
      assert.equal(puedeEditarEvidencias({ nombre: "Ana", rol: "admin" }, "Esteban"), true);
    },
  },
  {
    name: "omitir fotos en el payload no vacía las evidencias",
    run() {
      const missing = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        esperado: { evidencia_01: PATH_A, evidencia_02: null, evidencia_03: null },
      });
      assert.ok("error" in missing);
      const emptyExpected = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        fotos: [PATH_A],
      });
      assert.ok("error" in emptyExpected);
    },
  },
  {
    name: "guardar otros campos no incluye evidencias en el editor de datos",
    run() {
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_01"), false);
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_02"), false);
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_03"), false);
    },
  },
  {
    name: "respeta el máximo según la caja fuerte",
    run() {
      assert.equal(validateRevisionEvidencePhotos("Si", [PATH_A]), "Esta opción no admite evidencias.");
      assert.equal(validateRevisionEvidencePhotos("Check out", [PATH_A]), undefined);
      assert.equal(validateRevisionEvidencePhotos("Check out", [PATH_A, PATH_B]), "Solo puedes añadir la evidencia 1.");
      assert.equal(validateRevisionEvidencePhotos("Check in", []), "Añade la evidencia 1.");
      assert.equal(validateRevisionEvidencePhotos("Check in", [PATH_A, PATH_B, PATH_C]), undefined);
      const full = compactEvidenceSlots([PATH_A, PATH_B, PATH_C]);
      const items = evidenceDraftFromRow(full);
      assert.equal(canAddEvidenceDraft(items, "Check in"), false);
      const extra = addEvidenceDraftItems(items, [photo("de-mas")], "Check in");
      assert.equal(extra.added.length, 0);
      assert.equal(extra.skipped, 1);
    },
  },
  {
    name: "un dato desactualizado no se aplica",
    run() {
      const current = compactEvidenceSlots([PATH_A, PATH_B]);
      const expected = compactEvidenceSlots([PATH_A]);
      const next = compactEvidenceSlots([PATH_A, PATH_NEW]);
      assert.equal(revisionEvidenceEditDecision(current, expected, next), "stale");
    },
  },
  {
    name: "el borrador local no se aplica hasta tener rutas de subida",
    run() {
      const draft = evidenceDraftFromRow({ evidencia_01: PATH_A, evidencia_02: null, evidencia_03: null });
      const withNew = addEvidenceDraftItems(draft, [photo("pendiente")], "Check in");
      assert.equal(evidenceDraftSlots(withNew.items), null);
      const uploaded = markEvidenceDraftUploaded(withNew.items, "pendiente", PATH_NEW);
      assert.ok(sameEvidenceSlots(evidenceDraftSlots(uploaded), compactEvidenceSlots([PATH_A, PATH_NEW])));
    },
  },
  {
    name: "las ranuras se leen sin huecos ni texto vacío",
    run() {
      const slots = evidenceSlotsFromRow({
        evidencia_01: ` ${PATH_A} `,
        evidencia_02: "",
        evidencia_03: PATH_C,
      });
      assert.deepEqual(evidencePathsFromSlots(slots), [PATH_A, PATH_C]);
      assert.deepEqual(compactEvidenceSlots([PATH_A, " ", PATH_C]).evidencia_02, PATH_C);
    },
  },
];

let failed = 0;
for (const item of tests) {
  try {
    item.run();
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(error);
  }
}

if (failed) {
  console.error(`\n${failed}/${tests.length} pruebas fallaron`);
  process.exit(1);
}
console.log(`\n${tests.length} pruebas ok`);
