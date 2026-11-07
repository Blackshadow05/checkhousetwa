import assert from "node:assert/strict";
import { groupHoyCasitasConMemo } from "../src/lib/hoy-casitas-board.ts";
import {
  casitasConLlegada,
  casitasConLlegadaHoy,
  casitasConLlegadaManana,
} from "../src/lib/operaciones-memo.ts";
import {
  INICIO_LIST_LIMIT,
  contarCasitasHoy,
  groupHoyCasitas,
  keepInicioRevisiones,
} from "../src/lib/revisiones-display.ts";

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

function memoFila({
  casita,
  tipo,
  fecha_memo,
  llegada_fecha = null,
  salida_fecha = null,
}) {
  return {
    casita: String(casita),
    tipo,
    fecha_memo,
    llegada_fecha,
    salida_fecha,
  };
}

function agrupar({
  rows,
  today = HOY,
  upsells = [],
  llegadas = null,
  estadias = null,
  inHouseDelDia = null,
  llegadasHoy = null,
  salidasHoy = null,
  llegadasManana = null,
} = {}) {
  return groupHoyCasitas(
    rows,
    today,
    upsells,
    llegadas,
    estadias,
    inHouseDelDia,
    llegadasHoy,
    salidasHoy,
    llegadasManana,
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
    name: "Upsell con llegada mañana va a Check in de mañana en azul, no a Check in de hoy",
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
        llegadasManana: new Set(["21"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "12", tone: "sage" }]);
      assert.deepEqual(chips(groups, "check_in_manana"), [{ casita: "21", tone: "blue" }]);
      assert.equal(grupo(groups, "check_in"), null);
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

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "9", tone: "blue" }]);
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
    name: "Upsell viejo sin huésped ni llegada va a Pendiente de Guardar, no a vigentes",
    run() {
      const upsell = revision({
        id: "up-stale",
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
      assert.equal(grupo(groups, "upsell"), null);
      assert.deepEqual(chipsSeccion(groups, "ocupacion", "pendiente_guardar"), [
        { casita: "28", tone: "amber" },
      ]);
    },
  },
  {
    name: "Sin tipo de ocupación en el memo, el Upsell sin llegada sigue en vigentes",
    run() {
      const upsell = revision({
        id: "up-vigente-sin-tipo",
        casita: "28",
        caja_fuerte: "Upsell",
        created_at: `${AYER} 18:00`,
      });
      const groups = agrupar({
        rows: [],
        upsells: [upsell],
        llegadas: new Set(["12"]),
        llegadasHoy: new Set(["12"]),
      });

      assert.deepEqual(chips(groups, "upsell"), [{ casita: "28", tone: "blue" }]);
      assert.equal(seccion(groups, "ocupacion", "pendiente_guardar"), null);
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
  {
    name: "Montaje de ayer con llegada hoy aparece en Check in de hoy",
    run() {
      const montajeAyer = revision({
        id: "ci-ayer-llegada-hoy",
        casita: "8",
        caja_fuerte: "Check in",
        created_at: `${AYER} 16:40`,
      });
      const groups = agrupar({
        rows: [montajeAyer],
        llegadas: new Set(["8"]),
        llegadasHoy: new Set(["8"]),
        llegadasManana: new Set(),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "8", tone: "sage" }]);
      assert.equal(grupo(groups, "check_in_manana"), null);
      assert.equal(grupo(groups, "check_in"), null);
      assert.equal(seccion(groups, "ocupacion", "pendiente_guardar"), null);
    },
  },
  {
    name: "Check in revisado hoy con llegada mañana aparece en Check in de mañana",
    run() {
      const montaje = revision({
        id: "ci-hoy-llegada-manana",
        casita: "15",
        caja_fuerte: "Check in",
        created_at: `${HOY} 17:10`,
      });
      const groups = agrupar({
        rows: [montaje],
        llegadas: new Set(["15"]),
        llegadasHoy: new Set(),
        llegadasManana: new Set(["15"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_manana"), [{ casita: "15", tone: "sage" }]);
      assert.equal(grupo(groups, "check_in_hoy"), null);
      assert.equal(grupo(groups, "check_in"), null);
    },
  },
  {
    name: "Al cambiar el día, el mismo montaje pasa de Check in de mañana a Check in de hoy",
    run() {
      const montaje = revision({
        id: "ci-rollover",
        casita: "6",
        caja_fuerte: "Check in",
        created_at: `${HOY} 18:00`,
      });
      const manana = agrupar({
        rows: [montaje],
        today: HOY,
        llegadas: new Set(["6"]),
        llegadasHoy: new Set(),
        llegadasManana: new Set(["6"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });
      const diaLlegada = agrupar({
        rows: [montaje],
        today: MANANA,
        llegadas: new Set(["6"]),
        llegadasHoy: new Set(["6"]),
        llegadasManana: new Set(),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(manana, "check_in_manana"), [{ casita: "6", tone: "sage" }]);
      assert.equal(grupo(manana, "check_in_hoy"), null);
      assert.deepEqual(chips(diaLlegada, "check_in_hoy"), [{ casita: "6", tone: "sage" }]);
      assert.equal(grupo(diaLlegada, "check_in_manana"), null);
    },
  },
  {
    name: "Upsell de estadía activa sigue en En ocupación azul y no pasa a pendiente",
    run() {
      const upsell = revision({
        id: "up-ocupacion",
        casita: "19",
        caja_fuerte: "Upsell",
        created_at: `${AYER} 09:00`,
      });
      const groups = agrupar({
        rows: [],
        upsells: [upsell],
        llegadas: new Set(),
        llegadasHoy: new Set(),
        llegadasManana: new Set(),
        estadias: new Map([["19", { llegada: AYER, salida: MANANA }]]),
        inHouseDelDia: new Set(["19"]),
      });

      assert.deepEqual(chips(groups, "ocupacion"), [{ casita: "19", tone: "blue" }]);
      assert.equal(seccion(groups, "ocupacion", "pendiente_guardar"), null);
      assert.equal(grupo(groups, "upsell"), null);
    },
  },
  {
    name: "Upsell con llegada futura no se marca pendiente ni vigente",
    run() {
      const upsell = revision({
        id: "up-futuro",
        casita: "24",
        caja_fuerte: "Upsell",
        created_at: `${AYER} 11:00`,
      });
      const groups = agrupar({
        rows: [],
        upsells: [upsell],
        llegadas: new Set(["24"]),
        llegadasHoy: new Set(),
        llegadasManana: new Set(["24"]),
        estadias: new Map(),
        inHouseDelDia: new Set(),
      });

      assert.deepEqual(chips(groups, "check_in_manana"), [{ casita: "24", tone: "blue" }]);
      assert.equal(grupo(groups, "upsell"), null);
      assert.equal(seccion(groups, "ocupacion", "pendiente_guardar"), null);
    },
  },
  {
    name: "Conteo y deduplicación no se inflan al mezclar hoy, mañana, ocupación y pendiente",
    run() {
      const groups = agrupar({
        rows: [
          revision({ id: "ci-hoy-mix", casita: "3", caja_fuerte: "Check in", created_at: `${AYER} 15:00` }),
          revision({ id: "ci-manana-mix", casita: "5", caja_fuerte: "Check in", created_at: `${HOY} 16:00` }),
          revision({ id: "ci-ocu-mix", casita: "7", caja_fuerte: "Check in", created_at: `${AYER} 10:00` }),
          revision({ id: "pg-mix", casita: "9", caja_fuerte: "Check in", created_at: `${AYER} 08:00` }),
        ],
        upsells: [
          revision({ id: "up-stale-mix", casita: "11", caja_fuerte: "Upsell", created_at: `${AYER} 12:00` }),
        ],
        llegadas: new Set(["3", "5"]),
        llegadasHoy: new Set(["3"]),
        llegadasManana: new Set(["5"]),
        estadias: new Map([["7", { llegada: AYER, salida: MANANA }]]),
        inHouseDelDia: new Set(["7"]),
      });

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "3", tone: "sage" }]);
      assert.deepEqual(chips(groups, "check_in_manana"), [{ casita: "5", tone: "sage" }]);
      assert.deepEqual(chips(groups, "ocupacion"), [{ casita: "7", tone: "sage" }]);
      assert.deepEqual(chipsSeccion(groups, "ocupacion", "pendiente_guardar"), [
        { casita: "9", tone: "amber" },
        { casita: "11", tone: "amber" },
      ]);
      assert.equal(contarCasitasHoy(groups), 5);
      assertSinDuplicados(groups);
    },
  },
  {
    name: "llegada_fecha del memo separa hoy y mañana sin números fijos",
    run() {
      const filas = [
        { casita: "2", llegada_fecha: HOY, salida_fecha: MANANA, tipo: "Today's Arrivals", fecha_memo: HOY },
        { casita: "10", llegada_fecha: MANANA, salida_fecha: "2026-11-08", tipo: "Tomorrow's Arrivals", fecha_memo: HOY },
      ];
      assert.deepEqual([...casitasConLlegadaHoy(filas, HOY)], ["2"]);
      assert.deepEqual([...casitasConLlegadaManana(filas, HOY)], ["10"]);
      assert.deepEqual([...casitasConLlegada(filas, HOY)].sort(), ["10", "2"]);
    },
  },
  {
    name: "keepInicioRevisiones conserva el montaje de ayer aunque haya más de 100 filas nuevas",
    run() {
      const montajeAyer = revision({
        id: "keep-ayer",
        casita: "4",
        caja_fuerte: "Check in",
        created_at: `${AYER} 14:00`,
      });
      const recientes = Array.from({ length: INICIO_LIST_LIMIT }, (_, index) =>
        revision({
          id: `keep-nueva-${index}`,
          casita: String(50 + (index % 40)),
          caja_fuerte: "Si",
          created_at: `${HOY} ${String(10 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}`,
        }),
      );
      const kept = keepInicioRevisiones([montajeAyer, ...recientes], HOY);
      assert.equal(kept.some((row) => row.id === "keep-ayer"), true);
      assert.equal(kept.length > INICIO_LIST_LIMIT, true);
    },
  },
  {
    name: "Today's Arrivals del memo de mañana no se pierden por filtrar fecha_memo === hoy",
    run() {
      const filas = [
        memoFila({ casita: "13", tipo: "Today's Arrivals", fecha_memo: HOY, llegada_fecha: HOY, salida_fecha: MANANA }),
        memoFila({ casita: "13", tipo: "In house Guests", fecha_memo: HOY, llegada_fecha: HOY, salida_fecha: MANANA }),
        memoFila({ casita: "1", tipo: "In house Guests", fecha_memo: HOY, llegada_fecha: AYER, salida_fecha: MANANA }),
        memoFila({ casita: "8", tipo: "Today's Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-08" }),
        memoFila({ casita: "8", tipo: "In house Guests", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-08" }),
        memoFila({ casita: "16", tipo: "In house Guests", fecha_memo: MANANA, llegada_fecha: HOY, salida_fecha: "2026-11-08" }),
      ];
      assert.deepEqual([...casitasConLlegadaHoy(filas, HOY)].sort(), ["13"]);
      assert.deepEqual([...casitasConLlegadaManana(filas, HOY)].sort(), ["8"]);
      assert.equal(casitasConLlegadaHoy(filas, HOY).has("16"), false);
      assert.equal(casitasConLlegadaManana(filas, HOY).has("16"), false);
    },
  },
  {
    name: "Pipeline de Inicio: montaje el día anterior con Today's Arrivals en el memo de mañana",
    run() {
      const filas = [
        memoFila({ casita: "13", tipo: "Today's Arrivals", fecha_memo: HOY, llegada_fecha: HOY, salida_fecha: MANANA }),
        memoFila({ casita: "13", tipo: "In house Guests", fecha_memo: HOY, llegada_fecha: HOY, salida_fecha: MANANA }),
        memoFila({ casita: "1", tipo: "In house Guests", fecha_memo: HOY, llegada_fecha: AYER, salida_fecha: MANANA }),
        memoFila({ casita: "45", tipo: "Today´s Departure", fecha_memo: HOY, llegada_fecha: AYER, salida_fecha: HOY }),
        memoFila({ casita: "8", tipo: "Today's Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-08" }),
        memoFila({ casita: "27", tipo: "Today's Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-10" }),
        memoFila({ casita: "45", tipo: "Today's Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-10" }),
        memoFila({ casita: "16", tipo: "In house Guests", fecha_memo: MANANA, llegada_fecha: HOY, salida_fecha: "2026-11-08" }),
      ];
      const rows = [
        revision({ id: "ci-13", casita: "13", caja_fuerte: "Check in", created_at: `${HOY} 10:00` }),
        revision({ id: "ci-8", casita: "8", caja_fuerte: "Check in", created_at: `${HOY} 22:54` }),
        revision({ id: "ci-27", casita: "27", caja_fuerte: "Check in", created_at: `${HOY} 01:12` }),
        revision({ id: "ci-1", casita: "1", caja_fuerte: "Check in", created_at: `${AYER} 09:00` }),
        revision({ id: "ci-16", casita: "16", caja_fuerte: "Check in", created_at: `${AYER} 12:00` }),
      ];
      const upsells = [
        revision({ id: "up-45", casita: "45", caja_fuerte: "Upsell", created_at: `${AYER} 03:24` }),
      ];
      const groups = groupHoyCasitasConMemo(rows, HOY, upsells, filas);

      assert.deepEqual(chips(groups, "check_in_hoy"), [{ casita: "13", tone: "sage" }]);
      assert.deepEqual(chips(groups, "check_in_manana"), [
        { casita: "8", tone: "sage" },
        { casita: "27", tone: "sage" },
      ]);
      assert.deepEqual(chips(groups, "ocupacion"), [{ casita: "1", tone: "sage" }]);
      assert.deepEqual(chipsSeccion(groups, "ocupacion", "pendiente_guardar"), [
        { casita: "16", tone: "amber" },
        { casita: "45", tone: "rose" },
      ]);
      assert.equal(grupo(groups, "check_in"), null);
      assertSinDuplicados(groups);
      assert.equal(contarCasitasHoy(groups), 6);
    },
  },
  {
    name: "El mismo montaje y memo de mañana pasan a Check in de hoy al cambiar el día",
    run() {
      const filas = [
        memoFila({ casita: "8", tipo: "Today's Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-08" }),
        memoFila({ casita: "8", tipo: "In house Guests", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-08" }),
      ];
      const rows = [
        revision({ id: "ci-8-rollover", casita: "8", caja_fuerte: "Check in", created_at: `${HOY} 22:54` }),
      ];
      const vispera = groupHoyCasitasConMemo(rows, HOY, [], filas);
      const diaLlegada = groupHoyCasitasConMemo(rows, MANANA, [], filas);

      assert.deepEqual(chips(vispera, "check_in_manana"), [{ casita: "8", tone: "sage" }]);
      assert.equal(grupo(vispera, "check_in_hoy"), null);
      assert.deepEqual(chips(diaLlegada, "check_in_hoy"), [{ casita: "8", tone: "sage" }]);
      assert.equal(grupo(diaLlegada, "check_in_manana"), null);
    },
  },
  {
    name: "Apóstrofe raro de Today's Arrivals y fecha_memo mañana siguen contando como llegada",
    run() {
      const filas = [
        memoFila({ casita: "41", tipo: "Today´s Arrivals", fecha_memo: MANANA, llegada_fecha: MANANA, salida_fecha: "2026-11-10" }),
      ];
      assert.deepEqual([...casitasConLlegadaManana(filas, HOY)], ["41"]);
      const groups = groupHoyCasitasConMemo(
        [revision({ id: "ci-41", casita: "41", caja_fuerte: "Check in", created_at: `${HOY} 21:00` })],
        HOY,
        [],
        filas,
      );
      assert.deepEqual(chips(groups, "check_in_manana"), [{ casita: "41", tone: "sage" }]);
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
