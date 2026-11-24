import assert from "node:assert/strict";
import { REVISION_EDIT_FIELDS, puedeEditarRevision, validateRevisionFieldDependencies } from "../src/lib/revision-edit.ts";
import { evidencePathMark, evidenceStoragePath, isEvidenceCloudinaryPath, nextEvidenceStamp } from "../src/lib/revision-evidence.ts";
import { casitaAllowsFourPhotos, evidencePhotoLimit, revisionInsert, revisionPhotoLimit } from "../src/lib/revision-form.ts";
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
const PATH_D = "Evidencias/Noviembre 2026/evidencia_04_1730000000003";
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
      assert.equal(next.evidencia_04, null);
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
    name: "cualquier usuario activo puede editar evidencias, no solo autor o admin",
    run() {
      const autor = { nombre: "Esteban", rol: "user" };
      const otro = { nombre: "Ana", rol: "user" };
      const inactivo = { nombre: "Luis", rol: "inactivo" };
      assert.equal(puedeEditarRevision(autor, "Esteban"), true);
      assert.equal(puedeEditarRevision(otro, "Esteban"), false);
      assert.equal(puedeEditarEvidencias(autor, "Esteban"), true);
      assert.equal(puedeEditarEvidencias(otro, "Esteban"), true);
      assert.equal(puedeEditarEvidencias({ nombre: "Ana", rol: "admin" }, "Esteban"), true);
      assert.equal(puedeEditarEvidencias({ nombre: "Esteban", rol: "SuperAdmin" }, "Ana"), true);
      assert.equal(puedeEditarEvidencias({ nombre: "Ana", rol: null }, "Esteban"), true);
      assert.equal(puedeEditarEvidencias(inactivo, "Esteban"), false);
      assert.equal(puedeEditarEvidencias(null, "Esteban"), false);
    },
  },
  {
    name: "omitir fotos en el payload no vacía las evidencias",
    run() {
      const missing = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        esperado: { evidencia_01: PATH_A, evidencia_02: null, evidencia_03: null, evidencia_04: null },
      });
      assert.ok("error" in missing);
      const missingSlot4 = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        esperado: { evidencia_01: PATH_A, evidencia_02: null, evidencia_03: null },
        fotos: [PATH_A],
      });
      assert.ok("error" in missingSlot4);
      const emptyExpected = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        fotos: [PATH_A],
      });
      assert.ok("error" in emptyExpected);
      const valid = parseEvidenceEditPayload({
        id: "11111111-1111-4111-8111-111111111111",
        esperado: { evidencia_01: PATH_A, evidencia_02: null, evidencia_03: null, evidencia_04: null },
        fotos: [PATH_A, PATH_B, PATH_C, PATH_D],
      });
      assert.equal("error" in valid, false);
    },
  },
  {
    name: "guardar otros campos no incluye evidencias en el editor de datos",
    run() {
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_01"), false);
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_02"), false);
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_03"), false);
      assert.equal(REVISION_EDIT_FIELDS.includes("evidencia_04"), false);
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
  {
    name: "subidas simultáneas en el mismo milisegundo generan rutas únicas válidas",
    run() {
      const sameMs = 1795300000000;
      const now = new Date(sameMs);
      const paths = new Set();
      for (let i = 0; i < 20; i += 1) {
        const stamp = nextEvidenceStamp(sameMs);
        const generated = evidenceStoragePath("evidencia_01", stamp, now);
        assert.equal(isEvidenceCloudinaryPath(generated.path), true, `ruta válida: ${generated.path}`);
        assert.match(evidencePathMark(generated.path), /^\d{4}-\d{2}-\d{2}-\d{6}$/);
        paths.add(generated.path);
      }
      assert.equal(paths.size, 20, "ninguna ruta colisionó en el mismo milisegundo");
    },
  },
  {
    name: "casitas 1,2,3,4,7,8,9,10 permiten hasta 4 evidencias en manual y reconocimiento",
    run() {
      const permitidas = ["1", "2", "3", "4", "7", "8", "9", "10", "01", "09"];
      const normales = ["5", "6", "11", "12", "50", "", null];
      for (const casita of permitidas) {
        assert.equal(casitaAllowsFourPhotos(casita), true, `casita ${casita} debe permitir 4`);
        assert.equal(evidencePhotoLimit("Check in", casita), 4);
        assert.equal(evidencePhotoLimit("Check out", casita), 1);
        assert.equal(evidencePhotoLimit("Guardar Upsell", casita), 1);
        assert.equal(evidencePhotoLimit("Si", casita), 0);
        assert.equal(evidencePhotoLimit("No", casita), 0);
        assert.equal(revisionPhotoLimit("manual", "Check in", 0, casita), 4);
        assert.equal(revisionPhotoLimit("reconocimiento", "Check in", 3, casita), 4);
        assert.equal(validateRevisionEvidencePhotos("Check in", [PATH_A, PATH_B, PATH_C, PATH_D], casita), undefined);
      }
      for (const casita of normales) {
        assert.equal(casitaAllowsFourPhotos(casita), false, `casita ${casita} debe quedar en 3`);
        assert.equal(evidencePhotoLimit("Check in", casita), 3);
        assert.equal(revisionPhotoLimit("manual", "Check in", 0, casita), 3);
        assert.equal(
          validateRevisionEvidencePhotos("Check in", [PATH_A, PATH_B, PATH_C, PATH_D], casita),
          "Puedes añadir hasta 3 evidencias.",
        );
      }
      assert.equal(revisionPhotoLimit("reconocimiento", "", 0, ""), 4);
      assert.equal(revisionPhotoLimit("reconocimiento", "Check in", 3, ""), 4);
      assert.equal(revisionPhotoLimit("reconocimiento", "Check in", 4, "5"), 3);
      assert.equal(revisionPhotoLimit("reconocimiento", "Check out", 2, ""), 1);
      assert.equal(isEvidenceCloudinaryPath(PATH_D), true);
      const generated4 = evidenceStoragePath("evidencia_04", 1730000000123, new Date(1730000000123));
      assert.equal(isEvidenceCloudinaryPath(generated4.path), true);

      const three = evidenceDraftFromRow(compactEvidenceSlots([PATH_A, PATH_B, PATH_C]));
      assert.equal(canAddEvidenceDraft(three, "Check in", "1"), true);
      assert.equal(canAddEvidenceDraft(three, "Check in", "5"), false);
      const added4 = addEvidenceDraftItems(three, [photo("cuarta")], "Check in", "10");
      assert.equal(added4.added.length, 1);
      assert.equal(canAddEvidenceDraft(added4.items, "Check in", "10"), false);

      const rowConCuatro = {
        casita: "1",
        caja_fuerte: "Check in",
        room_move: null,
        evidencia_01: PATH_A,
        evidencia_02: PATH_B,
        evidencia_03: PATH_C,
        evidencia_04: PATH_D,
      };
      assert.equal(validateRevisionFieldDependencies("casita", "7", rowConCuatro), undefined);
      assert.match(
        validateRevisionFieldDependencies("casita", "5", rowConCuatro) ?? "",
        /admite hasta 3 evidencias/,
      );

      const insert = revisionInsert(
        "11111111-1111-4111-8111-111111111111",
        {
          casita: "04",
          quien_revisa: "Esteban",
          created_at: "2026-11-24T09:00",
          caja_fuerte: "Check in",
          puertas_ventanas: "Todo en orden",
          room_move: "",
          notas: "",
          chromecast: "1",
          speaker: "1",
          usb_speaker: "1",
          controles_tv: "1",
          secadora: "1",
          accesorios_secadora: "1",
          steamer: "1",
          bolsa_vapor: "Si",
          plancha_cabello: "1",
          binoculares: "1",
          trapo_binoculares: "Si",
          cola_caballo: "Si",
          bolso_yute: "1",
          bulto: "Si",
          sombrero: "Si",
          camas_ordenadas: "Si",
        },
        [PATH_A, PATH_B, PATH_C, PATH_D],
      );
      assert.equal(insert.evidencia_04, PATH_D);
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
