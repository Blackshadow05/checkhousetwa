import assert from "node:assert/strict";
import { test } from "node:test";
import { CONSEJOS_DIARIOS, consejoDay, consejoForDay, nextConsejoDayDelay } from "@/lib/consejos-diarios";

const DAY_MS = 86_400_000;
const dayAt = (ordinal: number) => new Date(ordinal * DAY_MS).toISOString().slice(0, 10);

test("el catálogo tiene 100 consejos únicos y 20 de cada tema", () => {
  assert.equal(CONSEJOS_DIARIOS.length, 100);
  assert.equal(new Set(CONSEJOS_DIARIOS.map((tip) => tip.id)).size, 100);
  assert.equal(new Set(CONSEJOS_DIARIOS.map((tip) => tip.consejo)).size, 100);
  for (const category of ["trabajo", "vida_personal", "finanzas", "aprendizaje", "habitos"]) {
    assert.equal(CONSEJOS_DIARIOS.filter((tip) => tip.categoria === category).length, 20);
  }
  assert.ok(CONSEJOS_DIARIOS.every((tip) => tip.consejo.trim().length >= 30 && tip.consejo.length <= 240));
});

test("el consejo es estable entre recargas y no depende del orden de la consulta", () => {
  const expected = consejoForDay("2026-10-02");
  assert.deepEqual(consejoForDay("2026-10-02"), expected);
  assert.deepEqual(consejoForDay("2026-10-02", [...CONSEJOS_DIARIOS].reverse()), expected);
});

test("cada ciclo mezcla los 100 consejos sin repetir y cambia el orden del siguiente", () => {
  const cycles = [0, 1, 206, 207];
  const orders = cycles.map((cycle) => Array.from({ length: 100 }, (_, index) => consejoForDay(dayAt(cycle * 100 + index)).id));
  for (const order of orders) assert.equal(new Set(order).size, 100);
  assert.notDeepEqual(orders[0], orders[1]);
  assert.notDeepEqual(orders[2], orders[3]);
  for (let cycle = 1; cycle <= 500; cycle++) {
    assert.notEqual(consejoForDay(dayAt(cycle * 100 - 1)).id, consejoForDay(dayAt(cycle * 100)).id);
  }
});

test("el día y el cambio de consejo respetan medianoche en Costa Rica", () => {
  const before = new Date("2026-10-03T05:59:59.000Z");
  const after = new Date("2026-10-03T06:00:00.000Z");
  assert.equal(consejoDay(before), "2026-10-02");
  assert.equal(consejoDay(after), "2026-10-03");
  assert.equal(nextConsejoDayDelay(before), 1050);
  assert.equal(nextConsejoDayDelay(after), DAY_MS + 50);
  assert.notEqual(consejoForDay(consejoDay(before)).id, consejoForDay(consejoDay(after)).id);
});

test("sin datos remotos conserva el catálogo local; catálogos pequeños siguen funcionando", () => {
  assert.deepEqual(consejoForDay("2026-10-02", []), consejoForDay("2026-10-02"));
  const small = CONSEJOS_DIARIOS.slice(0, 2);
  for (let ordinal = 20000; ordinal < 20020; ordinal++) {
    assert.notEqual(consejoForDay(dayAt(ordinal), small).id, consejoForDay(dayAt(ordinal + 1), small).id);
  }
  assert.deepEqual(consejoForDay("2026-10-02", small.slice(0, 1)), small[0]);
});

test("rechaza fechas mal formadas o inexistentes", () => {
  for (const day of ["", "mañana", "2026-02-30", "2026-13-01", "2026-1-2"]) {
    assert.throws(() => consejoForDay(day), /Fecha de consejo inválida/);
  }
});
