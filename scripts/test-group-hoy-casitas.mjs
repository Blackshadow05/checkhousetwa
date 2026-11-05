import assert from "node:assert/strict";
import { contarCasitasHoy, groupHoyCasitas } from "../src/lib/revisiones-display.ts";

const HOY = "2026-11-05";
const AYER = "2026-11-04";
const MANANA = "2026-11-06";

function revision({
  id,
  casita,
  caja_fuerte,
  created_at,
  pendiente = false,
}) {
  return {
    id,
    casita: String(casita),
    quien_revisa: "Esteban",
    caja_fuerte,
    created_at,
    puertas_ventanas: null,
    chromecast: null,
    binoculares: null,
    trapo_binoculares: null,
    speaker: null,
    usb_speaker: null,
    controles_tv: null,
    secadora: null,
    accesorios_secadora: null,
    steamer: null,
    bolsa_vapor: null,
    plancha_cabello: null,
    bulto: null,
    sombrero: null,
    bolso_yute: null,
    evidencia_01: null,
    evidencia_02: null,
    evidencia_03: null,
    camas_ordenadas: null,
    cola_caballo: null,
    notas: null,
    nota_extra: null,
    room_move: null,
    pendiente,
  };
}

function agrupar({
  rows,
  upsells = [],
  llegadas = null,
  estadias = null,
  inHouseDelDia = null,
  llegadasHoy = null,
  salidasHoy = null,
} = {}) {
  return groupHoyCasitas(
    rows,
    HOY,
    upsells,
    llegadas,
    estadias,
    inHouseDelDia,
    llegadasHoy,
    salidasHoy,
  );
}

function grupo(groups, id) {
  return groups.find((item) => item.id === id) ?? null;
}

function chips(groups, id) {
  return (grupo(groups, id)?.rows ?? []).map((chip) => ({
    casita: chip.casita,
    tone: chip.tone,
  }));
}

function seccion(groups, parentId, sectionId) {
  return grupo(groups, parentId)?.sections?.find((item) => item.id === sectionId) ?? null;
}

function chipsSeccion(groups, parentId, sectionId) {
  return (seccion(groups, parentId, sectionId)?.rows ?? []).map((chip) => ({
    casita: chip.casita,
    tone: chip.tone,
  }));
}

function todasLasCasitas(groups) {
  const out = [];
  for (const item of groups) {
    for (const chip of item.rows) out.push(chip.casita);
    for (const nested of item.sections ?? []) {
      for (const chip of nested.rows) out.push(chip.casita);
    }
  }
  return out;
}

function assertSinDuplicados(groups) {
  const casitas = todasLasCasitas(groups);
  assert.deepEqual(casitas, [...new Set(casitas)]);
}

const tests = [
  {
    name: "Upsell con llegada hoy se une a Check in de hoy en azul, sin sección Check in ni duplicados",
    run() {
      const checkInA = revision({
        id: "ci-a",
        casita: "1",
        caja_fuerte: "Check in",
        created_at: `${HOY} 09:00`,
      });
      const checkInB = revision({
        id: "ci-b",
        casita: "44",
        caja_fuerte: "Check in",
        created_at: `${HOY} 10:15`,
      });
      const upsellHoy = revision({
        id: "up-hoy",
        casita: "46",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 11:30`,
      });
      const groups = agrupar({
        rows: [checkInB, checkInA],
        upsells: [upsellHoy],
        llegadas: new Set(["1", "44", "46"]),
        llegadasHoy: new Set(["1", "44", "46"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.equal(grupo(groups, "check_in"), null);
      assert.deepEqual(chips(groups, "check_in_hoy"), [
        { casita: "1", tone: "sage" },
        { casita: "44", tone: "sage" },
        { casita: "46", tone: "blue" },
      ]);
      assert.equal(grupo(groups, "upsell"), null);
      assert.equal(grupo(groups, "ocupacion"), null);
      assert.equal(contarCasitasHoy(groups), 3);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "La misma regla no depende de números fijos: cualquier Upsell con llegada hoy va en azul",
    run() {
      const checkIn = revision({
        id: "ci-7",
        casita: "7",
        caja_fuerte: "Check in",
        created_at: `${HOY} 08:00`,
      });
      const upsellA = revision({
        id: "up-18",
        casita: "18",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 08:40`,
      });
      const upsellB = revision({
        id: "up-33",
        casita: "33",
        caja_fuerte: "upsell",
        created_at: `${AYER} 16:00`,
      });
      const groups = agrupar({
        rows: [checkIn],
        upsells: [upsellA, upsellB],
        llegadas: new Set(["7", "18", "33", "50"]),
        llegadasHoy: new Set(["7", "18", "33"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.equal(grupo(groups, "check_in"), null);
      assert.deepEqual(chips(groups, "check_in_hoy"), [
        { casita: "7", tone: "sage" },
        { casita: "18", tone: "blue" },
        { casita: "33", tone: "blue" },
      ]);
      assert.equal(grupo(groups, "upsell"), null);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "Upsell con llegada en otra fecha (mañana) sigue en Check in azul, no en Check in de hoy",
    run() {
      const checkInHoy = revision({
        id: "ci-hoy",
        casita: "12",
        caja_fuerte: "Check in",
        created_at: `${HOY} 09:00`,
      });
      const upsellManana = revision({
        id: "up-manana",
        casita: "21",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 12:00`,
      });
      const groups = agrupar({
        rows: [checkInHoy],
        upsells: [upsellManana],
        llegadas: new Set(["12", "21"]),
        llegadasHoy: new Set(["12"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "12", tone: "sage" }]);
      assert.deepEqual(chips(groups, "check_in"), [{ casita: "21", tone: "blue" }]);
      assert.equal(grupo(groups, "upsell"), null);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "Si ya hay montaje Check in de hoy, el Upsell posterior de esa casita no se duplica",
    run() {
      const checkIn = revision({
        id: "ci-9",
        casita: "9",
        caja_fuerte: "Check inn",
        created_at: `${HOY} 07:30`,
      });
      const upsell = revision({
        id: "up-9",
        casita: "9",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 13:00`,
      });
      const groups = agrupar({
        rows: [checkIn],
        upsells: [upsell],
        llegadas: new Set(["9"]),
        llegadasHoy: new Set(["9"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "9", tone: "sage" }]);
      assert.equal(grupo(groups, "check_in"), null);
      assert.equal(grupo(groups, "upsell"), null);
      assert.equal(todasLasCasitas(groups).filter((n) => n === "9").length, 1);
    },
  },
  {
    name: "Upsell con llegada hoy también se detecta si viene en las revisiones y no en el arreglo de upsells",
    run() {
      const upsellHoy = revision({
        id: "up-en-rows",
        casita: "17",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 11:00`,
      });
      const groups = agrupar({
        rows: [upsellHoy],
        upsells: [],
        llegadas: new Set(["17"]),
        llegadasHoy: new Set(["17"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "17", tone: "blue" }]);
      assert.equal(grupo(groups, "check_in"), null);
      assert.equal(grupo(groups, "upsell"), null);
    },
  },
  {
    name: "Upsell In house con llegada hoy va a Check in de hoy azul, no a En ocupación",
    run() {
      const upsell = revision({
        id: "up-inhouse-hoy",
        casita: "30",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 09:00`,
      });
      const groups = agrupar({
        rows: [],
        upsells: [upsell],
        llegadas: new Set(["30"]),
        llegadasHoy: new Set(["30"]),
        estadias: new Map([["30", { llegada: HOY, salida: MANANA }]]),
        inHouseDelDia: new Set(["30"]),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "30", tone: "blue" }]);
      assert.equal(grupo(groups, "ocupacion"), null);
      assert.equal(grupo(groups, "check_in"), null);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "Upsell vigente sin llegada no entra a Check in de hoy",
    run() {
      const upsell = revision({
        id: "up-vigente",
        casita: "28",
        caja_fuerte: "Upsell",
        created_at: `${AYER} 18:00`,
      });
      const groups = agrupar({
        rows: [],
        upsells: [upsell],
        llegadas: new Set(["12"]),
        llegadasHoy: new Set(["12"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.equal(grupo(groups, "check_in"), null);
      assert.equal(grupo(groups, "check_in_hoy"), null);
      assert.deepEqual(chips(groups, "upsell"), [{ casita: "28", tone: "blue" }]);
    },
  },
  {
    name: "En ocupación exige Check in o Upsell de la estadía actual y no duplica llegadas de hoy",
    run() {
      const checkInHoy = revision({
        id: "ci-hoy-5",
        casita: "5",
        caja_fuerte: "Check in",
        created_at: `${HOY} 09:00`,
      });
      const checkInEstadia = revision({
        id: "ci-estadia-8",
        casita: "8",
        caja_fuerte: "Check in",
        created_at: `${AYER} 11:00`,
      });
      const upsellEstadia = revision({
        id: "up-estadia-14",
        casita: "14",
        caja_fuerte: "Upsell",
        created_at: `${AYER} 15:00`,
      });
      const siDespues = revision({
        id: "si-14",
        casita: "14",
        caja_fuerte: "Si",
        created_at: `${HOY} 08:00`,
      });
      const groups = agrupar({
        rows: [siDespues, checkInHoy, checkInEstadia],
        upsells: [upsellEstadia],
        llegadas: new Set(["5"]),
        llegadasHoy: new Set(["5"]),
        estadias: new Map([
          ["8", { llegada: AYER, salida: MANANA }],
          ["14", { llegada: AYER, salida: MANANA }],
        ]),
        inHouseDelDia: new Set(["8", "14"]),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "5", tone: "sage" }]);
      assert.deepEqual(chips(groups, "ocupacion"), [
        { casita: "8", tone: "sage" },
        { casita: "14", tone: "blue" },
      ]);
      assert.equal(grupo(groups, "check_in"), null);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "Pendiente de Guardar: salida de hoy en rojo; el resto amber",
    run() {
      const pendienteSalida = revision({
        id: "pg-salida",
        casita: "21",
        caja_fuerte: "Check in",
        created_at: `${AYER} 10:00`,
      });
      const pendienteOtro = revision({
        id: "pg-otro",
        casita: "16",
        caja_fuerte: "Check in",
        created_at: `${AYER} 12:00`,
      });
      const groups = agrupar({
        rows: [pendienteSalida, pendienteOtro],
        upsells: [],
        llegadas: new Set(["3"]),
        llegadasHoy: new Set(["3"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
        salidasHoy: new Set(["21"]),
      });

      assert.deepEqual(chipsSeccion(groups, "ocupacion", "pendiente_guardar"), [
        { casita: "16", tone: "amber" },
        { casita: "21", tone: "rose" },
      ]);
      assert.equal(grupo(groups, "check_in_hoy"), null);
    },
  },
  {
    name: "Sin memo, los Check in de hoy van a Check in de hoy y los Upsell siguen vigentes",
    run() {
      const checkIn = revision({
        id: "ci-sin-memo",
        casita: "4",
        caja_fuerte: "Check in",
        created_at: `${HOY} 09:00`,
      });
      const upsell = revision({
        id: "up-sin-memo",
        casita: "11",
        caja_fuerte: "Upsell",
        created_at: `${HOY} 10:00`,
      });
      const groups = agrupar({
        rows: [checkIn],
        upsells: [upsell],
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "4", tone: "sage" }]);
      assert.equal(grupo(groups, "check_in"), null);
      assert.deepEqual(chips(groups, "upsell"), [{ casita: "11", tone: "blue" }]);
    },
  },
];

let failed = 0;
for (const item of tests) {
  try {
    item.run();
    console.log(`ok  ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok  ${item.name}`);
    console.error(error);
  }
}

if (failed) {
  console.error(`\n${failed}/${tests.length} pruebas fallaron`);
  process.exit(1);
}

console.log(`\n${tests.length} pruebas ok`);
