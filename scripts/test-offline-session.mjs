import assert from "node:assert/strict";
import {
  buildOfflineSession,
  isOfflineSessionValid,
  OFFLINE_SESSION_MAX_AGE_MS,
} from "../src/lib/offline-session.ts";

const t0 = Date.UTC(2026, 10, 22, 12, 0, 0);
const snapshot = buildOfflineSession({ id: 7, nombre: "Esteban", rol: "admin" }, t0);

assert.equal(snapshot.user.id, 7);
assert.equal(snapshot.user.nombre, "Esteban");
assert.equal(snapshot.user.rol, "admin");
assert.equal(snapshot.expiresAt - snapshot.savedAt, OFFLINE_SESSION_MAX_AGE_MS);

assert.equal(isOfflineSessionValid(snapshot, t0), true, "vigente al guardarse");
assert.equal(
  isOfflineSessionValid(snapshot, t0 + OFFLINE_SESSION_MAX_AGE_MS - 1000),
  true,
  "vigente antes de vencer",
);
assert.equal(
  isOfflineSessionValid(snapshot, t0 + OFFLINE_SESSION_MAX_AGE_MS),
  false,
  "vence exactamente al cumplir el máximo",
);
assert.equal(
  isOfflineSessionValid({ ...snapshot, expiresAt: t0 + OFFLINE_SESSION_MAX_AGE_MS * 2 }, t0 + 1000),
  false,
  "rechaza expiresAt manipulado más allá del máximo",
);
assert.equal(
  isOfflineSessionValid({ ...snapshot, savedAt: t0 + 10 * 60 * 1000 }, t0),
  false,
  "rechaza savedAt en el futuro",
);

for (const invalido of [
  null,
  {},
  { user: { id: 0, nombre: "Ana" }, savedAt: t0, expiresAt: t0 + 1000 },
  { user: { id: 1, nombre: "   " }, savedAt: t0, expiresAt: t0 + 1000 },
  { user: { id: 1, nombre: "Ana", rol: 123 }, savedAt: t0, expiresAt: t0 + 1000 },
]) {
  assert.equal(
    isOfflineSessionValid(invalido, t0),
    false,
    `rechaza snapshot inválido: ${JSON.stringify(invalido)}`,
  );
}

console.log("test-offline-session: OK");
