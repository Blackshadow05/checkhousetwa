import assert from "node:assert/strict";
import { test } from "node:test";
import { colones, esFeriado, netoCcss, pagoConQuincena, resumenExtras, type HorarioRow } from "../src/lib/horarios";

function fila(fecha: string, turno: string, empleado = "Ana"): HorarioRow {
  return { id: `${empleado}-${fecha}`, empleado, fecha, turno, es_especial: false };
}

test("reconoce los feriados de Costa Rica, incluida la Semana Santa", () => {
  for (const fecha of ["2026-01-01", "2026-04-02", "2026-04-03", "2026-04-11", "2026-05-01", "2026-07-25", "2026-08-15", "2026-08-31", "2026-09-15", "2025-12-01", "2025-12-25", "2027-03-25", "2027-03-26"]) {
    assert.equal(esFeriado(fecha), true, fecha);
  }
  for (const fecha of ["2026-04-05", "2026-04-13", "2026-08-02", "2026-10-12", "2026-10-04"]) {
    assert.equal(esFeriado(fecha), false, fecha);
  }
});

test("calcula montos brutos y netos de las extras de la planilla", () => {
  const rows = [
    ...["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"].map(fecha => fila(fecha, "2pm/10pm")),
    ...["2026-09-06", "2026-09-07", "2026-09-08"].map(fecha => fila(fecha, "10pm/6am")),
    fila("2026-09-09", "6am/2pm"),
    fila("2026-09-10", "2pm/10pm", "Luis"),
  ];
  const resumen = resumenExtras(rows, "Ana", "2026-09-01", "2026-09-10", "2026-10-04");
  assert.equal(resumen.mixtas, 5);
  assert.equal(resumen.nocturnas, 6);
  assert.equal(colones(resumen.montoMixtas), "₡14,489.70");
  assert.equal(colones(resumen.montoNocturnas), "₡20,285.55");
  assert.equal(colones(resumen.bruto), "₡34,775.25");
  assert.equal(colones(resumen.neto), "₡31,009.09");
  assert.equal(colones(netoCcss(289794)), "₡2,584.09");
  assert.equal(colones(netoCcss(338092.5)), "₡3,014.77");
});

test("paga dobles las extras trabajadas en feriado", () => {
  const rows = [fila("2026-09-15", "2pm/10pm"), fila("2026-09-14", "10pm/6am"), fila("2026-09-15", "10pm/6am", "Luis")];
  const ana = resumenExtras(rows, "Ana", "2026-09-14", "2026-09-15", "2026-10-04");
  assert.equal(ana.mixtasFeriado, 1);
  assert.equal(ana.nocturnasFeriado, 2);
  assert.equal(colones(ana.montoMixtas), "₡5,795.88");
  assert.equal(colones(ana.montoNocturnas), "₡13,523.70");
  const luis = resumenExtras(rows, "Luis", "2026-09-15", "2026-09-15", "2026-10-04");
  assert.equal(luis.nocturnasFeriado, 0);
  assert.equal(colones(luis.bruto), "₡6,761.85");
});

test("suma el salario de la quincena al bruto y neto", () => {
  assert.deepEqual(pagoConQuincena(0), { bruto: 20285550, neto: 17870400 });
  const conExtras = pagoConQuincena(289794);
  assert.equal(colones(conExtras.bruto), "₡205,753.44");
  assert.equal(colones(conExtras.neto), "₡181,288.10");
});
