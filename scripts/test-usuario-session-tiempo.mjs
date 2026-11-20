import assert from "node:assert/strict";
import { nuevoPayloadUsuario, payloadUsuarioVigente, USUARIO_SESSION_HOURS } from "../src/lib/usuarios-session-tiempo.ts";

const H = 60 * 60 * 1000;
const t0 = Date.UTC(2026, 10, 18, 12);

assert.equal(USUARIO_SESSION_HOURS, 9);
const nueva = nuevoPayloadUsuario(7, t0);
assert.equal(nueva.expires - t0, 9 * H, "la cookie nueva dura 9 h");
assert.ok(payloadUsuarioVigente(nueva, t0), "vigente al iniciar");
assert.ok(payloadUsuarioVigente(nueva, t0 + 8.9 * H), "vigente a las 8.9 h");
assert.ok(!payloadUsuarioVigente(nueva, t0 + 9 * H), "vence a las 9 h");
assert.ok(!payloadUsuarioVigente({ ...nueva, expires: t0 + 6 * 24 * H }, t0 + 10 * H), "no se puede alargar cambiando expires");
assert.ok(!payloadUsuarioVigente({ ...nueva, iat: t0 + 2 * H }, t0), "iat en el futuro se rechaza");

// Cookies antiguas de 6 días (sin iat): valen solo 9 h desde su inicio.
const legacy = (inicio) => ({ id: 7, expires: inicio + 6 * 24 * H });
assert.ok(payloadUsuarioVigente(legacy(t0 - 2 * H), t0), "antigua con 2 h sigue vigente");
assert.ok(!payloadUsuarioVigente(legacy(t0 - 10 * H), t0), "antigua con 10 h se cierra");
assert.ok(!payloadUsuarioVigente(legacy(t0 - 3 * 24 * H), t0), "antigua de 3 días se cierra");

for (const malo of [null, {}, { id: "7", expires: t0 + H }, { id: 7 }, { id: 7.5, iat: t0, expires: t0 + H }]) {
  assert.ok(!payloadUsuarioVigente(malo, t0), `inválido: ${JSON.stringify(malo)}`);
}
console.log("test-usuario-session-tiempo: OK");
