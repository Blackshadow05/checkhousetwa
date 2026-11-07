import assert from "node:assert/strict";
import {
  HOY_GRUPO_CHIP_LIMITE,
  alternarExpansionGrupo,
  casitasAlcanzablesHoy,
  chipsVisiblesGrupo,
  conteoEncabezadoGrupo,
  etiquetaExpansionGrupo,
  grupoMuestraExpansion,
  vistaExpansionGrupo,
  vistasTableroHoy,
} from "../src/lib/hoy-casitas-expansion.ts";

function chip(casita, tone = "teal") {
  return {
    row: { id: `rev-${casita}`, casita: String(casita) },
    casita: String(casita),
    tone,
  };
}

function grupo({ id, label, tone = "sage", n = 0, casitas, sections }) {
  const rows = casitas
    ? casitas.map((numero) => chip(numero, tone))
    : Array.from({ length: n }, (_, index) => chip(`${id}-${index + 1}`, tone));
  return {
    id,
    label,
    tone,
    rows,
    ...(sections ? { sections } : {}),
  };
}

function vistaDe(tablero, id, expandidoPorId) {
  const vista = vistasTableroHoy(tablero, expandidoPorId).find((item) => item.id === id);
  assert.ok(vista, `falta el grupo ${id}`);
  return vista;
}

const ocupacionScreenshot = grupo({
  id: "ocupacion",
  label: "En ocupación",
  tone: "teal",
  n: 12,
  sections: [
    grupo({
      id: "pendiente_guardar",
      label: "Pendiente de Guardar",
      tone: "amber",
      casitas: ["20", "21", "22"],
    }),
  ],
});

const tableroRico = [
  grupo({ id: "check_in_hoy", label: "Check in de hoy", tone: "sage", n: 13 }),
  ocupacionScreenshot,
  grupo({ id: "upsell", label: "Upsell", tone: "blue", n: 13 }),
  grupo({ id: "check_out", label: "Check out", tone: "rose", n: 12 }),
  grupo({ id: "check_in_manana", label: "Check in de mañana", tone: "sage", n: 5 }),
];

const ocupacionNestedOverflow = grupo({
  id: "ocupacion",
  label: "En ocupación",
  tone: "teal",
  n: 12,
  sections: [
    grupo({
      id: "pendiente_guardar",
      label: "Pendiente de Guardar",
      tone: "amber",
      n: 13,
    }),
  ],
});

const tests = [
  {
    name: "el límite visible por defecto es 12",
    run() {
      assert.equal(HOY_GRUPO_CHIP_LIMITE, 12);
    },
  },
  {
    name: "<=12 filas directas no muestra control y deja todas visibles",
    run() {
      for (const n of [0, 1, 11, 12]) {
        assert.equal(grupoMuestraExpansion(n), false, `n=${n}`);
        const filas = Array.from({ length: n }, (_, index) => index + 1);
        assert.deepEqual(chipsVisiblesGrupo(filas, false), filas);
        assert.deepEqual(chipsVisiblesGrupo(filas, true), filas);
      }
    },
  },
  {
    name: "exactamente 12 no trunca ni ofrece Ver todas",
    run() {
      const group = grupo({ id: "check_out", label: "Check out", tone: "rose", n: 12 });
      const vista = vistaExpansionGrupo(group, false);
      assert.equal(vista.encabezado, 12);
      assert.equal(vista.muestraControl, false);
      assert.equal(vista.etiquetaControl, null);
      assert.equal(vista.filasVisibles.length, 12);
    },
  },
  {
    name: "13+ colapsado muestra las primeras 12 y Ver todas",
    run() {
      const group = grupo({ id: "check_in_hoy", label: "Check in de hoy", n: 13 });
      const vista = vistaExpansionGrupo(group, false);
      assert.equal(vista.encabezado, 13);
      assert.equal(vista.muestraControl, true);
      assert.equal(vista.etiquetaControl, "Ver todas");
      assert.deepEqual(
        vista.filasVisibles.map((item) => item.casita),
        group.rows.slice(0, 12).map((item) => item.casita),
      );
      assert.equal(vista.filasVisibles.length, 12);
    },
  },
  {
    name: "13+ expandido muestra TODAS las fichas, sin tope extra, y Ver menos",
    run() {
      const group = grupo({ id: "upsell", label: "Upsell", tone: "blue", n: 50 });
      const vista = vistaExpansionGrupo(group, true);
      assert.equal(vista.encabezado, 50);
      assert.equal(vista.muestraControl, true);
      assert.equal(vista.etiquetaControl, "Ver menos");
      assert.equal(vista.filasVisibles.length, 50);
      assert.equal(vista.filasVisibles[49]?.casita, "upsell-50");
      assert.equal(chipsVisiblesGrupo(group.rows, true).length, 50);
    },
  },
  {
    name: "colapsar vuelve a 12 y a Ver todas, sin perder el total",
    run() {
      const group = grupo({ id: "check_in_hoy", label: "Check in de hoy", n: 13 });
      let expandido = new Set();
      expandido = alternarExpansionGrupo(expandido, "check_in_hoy");
      assert.equal(vistaExpansionGrupo(group, true).filasVisibles.length, 13);
      expandido = alternarExpansionGrupo(expandido, "check_in_hoy");
      assert.equal(expandido.has("check_in_hoy"), false);
      const colapsado = vistaExpansionGrupo(group, false);
      assert.equal(colapsado.filasVisibles.length, 12);
      assert.equal(colapsado.etiquetaControl, "Ver todas");
      assert.equal(colapsado.encabezado, 13);
    },
  },
  {
    name: "ocupación 12 directas + 3 pendientes: total 15, sin Ver todas en el padre",
    run() {
      const vista = vistaExpansionGrupo(ocupacionScreenshot, false);
      assert.equal(conteoEncabezadoGrupo(ocupacionScreenshot), 15);
      assert.equal(vista.encabezado, 15);
      assert.equal(vista.muestraControl, false);
      assert.equal(vista.filasVisibles.length, 12);
      const nested = vistaExpansionGrupo(ocupacionScreenshot.sections[0], false);
      assert.equal(nested.encabezado, 3);
      assert.equal(nested.muestraControl, false);
      assert.equal(nested.filasVisibles.length, 3);
      assert.deepEqual(
        casitasAlcanzablesHoy([ocupacionScreenshot], new Set()),
        [...ocupacionScreenshot.rows.map((item) => item.casita), "20", "21", "22"],
      );
    },
  },
  {
    name: "el padre no se abre porque el agregado pasa de 12 si la grilla directa no pasa de 12",
    run() {
      const expandido = alternarExpansionGrupo(new Set(), "ocupacion");
      const padre = vistaDe([ocupacionNestedOverflow], "ocupacion", expandido);
      assert.equal(padre.encabezado, 25);
      assert.equal(padre.muestraControl, false);
      assert.equal(padre.filasVisibles.length, 12);
      assert.equal(padre.etiquetaControl, null);
    },
  },
  {
    name: "Pendiente de Guardar anidado tiene su propio Ver todas/Ver menos",
    run() {
      let expandido = new Set();
      const colapsado = vistaDe([ocupacionNestedOverflow], "pendiente_guardar", expandido);
      assert.equal(colapsado.muestraControl, true);
      assert.equal(colapsado.filasVisibles.length, 12);
      assert.equal(colapsado.encabezado, 13);

      expandido = alternarExpansionGrupo(expandido, "pendiente_guardar");
      const abierto = vistaDe([ocupacionNestedOverflow], "pendiente_guardar", expandido);
      assert.equal(abierto.etiquetaControl, "Ver menos");
      assert.equal(abierto.filasVisibles.length, 13);

      const padre = vistaDe([ocupacionNestedOverflow], "ocupacion", expandido);
      assert.equal(padre.muestraControl, false);
      assert.equal(padre.filasVisibles.length, 12);
      assert.equal(padre.encabezado, 25);
    },
  },
  {
    name: "hermanos conservan su propio estado de expansión",
    run() {
      let expandido = new Set();
      expandido = alternarExpansionGrupo(expandido, "check_in_hoy");
      const vistas = vistasTableroHoy(tableroRico, expandido);
      const porId = Object.fromEntries(vistas.map((vista) => [vista.id, vista]));

      assert.equal(porId.check_in_hoy.filasVisibles.length, 13);
      assert.equal(porId.check_in_hoy.etiquetaControl, "Ver menos");
      assert.equal(porId.upsell.filasVisibles.length, 12);
      assert.equal(porId.upsell.etiquetaControl, "Ver todas");
      assert.equal(porId.ocupacion.muestraControl, false);
      assert.equal(porId.pendiente_guardar.muestraControl, false);
      assert.equal(porId.check_out.muestraControl, false);
      assert.equal(porId.check_out.filasVisibles.length, 12);
      assert.equal(porId.check_in_manana.filasVisibles.length, 5);

      expandido = alternarExpansionGrupo(expandido, "upsell");
      const despues = vistasTableroHoy(tableroRico, expandido);
      const otra = Object.fromEntries(despues.map((vista) => [vista.id, vista]));
      assert.equal(otra.check_in_hoy.filasVisibles.length, 13);
      assert.equal(otra.upsell.filasVisibles.length, 13);
      assert.equal(otra.upsell.etiquetaControl, "Ver menos");
    },
  },
  {
    name: "expandir no oculta el pendiente anidado ni acopla su control",
    run() {
      const padreGrande = grupo({
        id: "ocupacion",
        label: "En ocupación",
        tone: "teal",
        n: 13,
        sections: [
          grupo({
            id: "pendiente_guardar",
            label: "Pendiente de Guardar",
            tone: "amber",
            n: 13,
          }),
        ],
      });
      let expandido = alternarExpansionGrupo(new Set(), "ocupacion");
      const padre = vistaDe([padreGrande], "ocupacion", expandido);
      const nested = vistaDe([padreGrande], "pendiente_guardar", expandido);
      assert.equal(padre.filasVisibles.length, 13);
      assert.equal(nested.filasVisibles.length, 12);
      assert.equal(nested.etiquetaControl, "Ver todas");
      const alcanzables = casitasAlcanzablesHoy([padreGrande], expandido);
      assert.equal(alcanzables.length, 25);
      assert.ok(alcanzables.includes("pendiente_guardar-12"));
      assert.equal(alcanzables.includes("pendiente_guardar-13"), false);

      expandido = alternarExpansionGrupo(expandido, "pendiente_guardar");
      assert.equal(casitasAlcanzablesHoy([padreGrande], expandido).length, 26);
      assert.ok(casitasAlcanzablesHoy([padreGrande], expandido).includes("pendiente_guardar-13"));
    },
  },
  {
    name: "todas las fichas visibles conservan tono, casita y enlace de detalle",
    run() {
      const group = grupo({ id: "check_in_hoy", label: "Check in de hoy", n: 13 });
      const clicks = [];
      const abrir = (item) => {
        clicks.push({
          casita: item.casita,
          tone: item.tone,
          detalle: Boolean(item.row?.id),
        });
      };
      chipsVisiblesGrupo(group.rows, false).forEach(abrir);
      assert.equal(clicks.length, 12);
      assert.equal(clicks.at(-1)?.casita, "check_in_hoy-12");
      clicks.length = 0;
      chipsVisiblesGrupo(group.rows, true).forEach(abrir);
      assert.equal(clicks.length, 13);
      assert.ok(clicks.every((item) => item.detalle && item.tone === "sage"));
      assert.deepEqual(
        clicks.map((item) => item.casita),
        group.rows.map((item) => item.casita),
      );
    },
  },
  {
    name: "el conteo del encabezado es el total real, no el recorte visible",
    run() {
      const group = grupo({
        id: "ocupacion",
        label: "En ocupación",
        tone: "teal",
        n: 13,
        sections: [grupo({ id: "pendiente_guardar", label: "Pendiente de Guardar", n: 4 })],
      });
      const colapsado = vistaExpansionGrupo(group, false);
      const abierto = vistaExpansionGrupo(group, true);
      assert.equal(colapsado.filasVisibles.length, 12);
      assert.equal(abierto.filasVisibles.length, 13);
      assert.equal(colapsado.encabezado, 17);
      assert.equal(abierto.encabezado, 17);
    },
  },
  {
    name: "etiquetas en español llano",
    run() {
      assert.equal(etiquetaExpansionGrupo(false), "Ver todas");
      assert.equal(etiquetaExpansionGrupo(true), "Ver menos");
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
