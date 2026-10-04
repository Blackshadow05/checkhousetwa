import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { eliminarRevisiones, fetchRegistrosEliminados, fetchRevisionesParaEliminar } from "@/app/actions/eliminar-revisiones";
import { validDeleteIds, validDeleteCursor, type RegistroEliminado } from "@/lib/eliminar-revisiones";
import { screenFromPath, screenFromSlug } from "@/lib/navigation/screens";

const uuid = (i: number) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const record: RegistroEliminado = { id: uuid(2001), fecha: "2026-10-03T20:00:00Z", usuario_id: 7, usuario: "Super de prueba", ip: null, cantidad: 1 };
const state = {
  calls: [] as { url: URL; method: string; body: unknown }[],
  rows: [] as unknown[], error: null as { code: string; message: string } | null,
  linked: uuid(1), role: "SuperAdmin", authUser: uuid(1) as string | null,
  factors: [{ id: uuid(2), status: "verified", factor_type: "totp" }],
  verifyFails: false, challengeFails: false, challengeCount: 0, verifyCount: 0,
  sessionId: uuid(3), aal: "aal2",
};
const admin = createClient("https://isolated-test.supabase.co", "test-only-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, options) => {
    const url = new URL(String(input));
    state.calls.push({ url, method: options?.method || "GET", body: options?.body ? JSON.parse(String(options.body)) : null });
    const isProfile = url.pathname.endsWith("/Usuarios");
    const isRpc = url.pathname.includes("/rpc/");
    const response = isProfile ? { id: 7, Rol: state.role, auth_user_id: state.linked } : state.error || (isRpc ? [record] : state.rows);
    return new Response(JSON.stringify(response), { status: !isProfile && state.error ? 400 : 200, headers: { "content-type": "application/json" } });
  } },
});
const globals = globalThis as typeof globalThis & { __deleteSession: { id: number; rol: string } | null; __deleteAdmin: typeof admin; __deleteAuth: unknown; __deleteHeaders: Headers };
globals.__deleteAdmin = admin;
globals.__deleteAuth = { auth: {
  getUser: async () => ({ data: { user: state.authUser ? { id: state.authUser } : null }, error: null }),
  mfa: {
    listFactors: async () => ({ data: { totp: state.factors }, error: null }),
    challenge: async () => { state.challengeCount++; return { data: { id: uuid(100 + state.challengeCount) }, error: state.challengeFails ? new Error("challenge failure") : null }; },
    verify: async (input: { factorId: string; challengeId: string; code: string }) => {
      state.verifyCount++; assert.equal(input.factorId, uuid(2)); assert.equal(input.code, "123456");
      assert.equal(input.challengeId, uuid(100 + state.challengeCount));
      return { data: { user: { id: state.authUser }, access_token: `header.${Buffer.from(JSON.stringify({ session_id: state.sessionId, aal: state.aal })).toString("base64url")}.signature` }, error: state.verifyFails ? new Error("invalid code") : null };
    },
  },
} };

beforeEach(() => {
  globals.__deleteSession = { id: 7, rol: "SuperAdmin" }; globals.__deleteHeaders = new Headers();
  state.calls = []; state.rows = []; state.error = null; state.linked = uuid(1); state.role = "SuperAdmin"; state.authUser = uuid(1);
  state.factors = [{ id: uuid(2), status: "verified", factor_type: "totp" }];
  state.verifyFails = false; state.challengeFails = false; state.challengeCount = 0; state.verifyCount = 0; state.sessionId = uuid(3); state.aal = "aal2";
});
const mutations = () => state.calls.filter(call => call.method !== "GET");

test("roles comunes, admin y sesiones ausentes no leen ni borran", async () => {
  for (const rol of [null, "user", "admin", "inactivo", "superadmin"]) {
    globals.__deleteSession = rol ? { id: 7, rol } : null;
    assert.equal((await fetchRevisionesParaEliminar()).denied, true);
    assert.equal((await fetchRegistrosEliminados()).denied, true);
    assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  }
  assert.equal(state.calls.length, 0); assert.equal(state.challengeCount, 0);
});
test("selecciones vacías, duplicadas, manipuladas o mayores a 200 no llegan a Auth ni DB", async () => {
  for (const ids of [[], [uuid(1), uuid(1)], ["not-a-uuid"], [null], Array.from({ length: 201 }, (_, i) => uuid(i)), "wrong"]) {
    assert.equal(validDeleteIds(ids), false); assert.ok((await eliminarRevisiones(ids as never, "123456")).error);
  }
  const mixedCase = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  assert.equal(validDeleteIds([mixedCase, mixedCase.toUpperCase()]), false);
  for (const code of ["", "12345", "1234567", "abcdef", null]) assert.ok((await eliminarRevisiones([uuid(1)], code as never)).error);
  assert.equal(state.calls.length, 0); assert.equal(state.challengeCount, 0);
});
test("un rol revocado o una cuenta Auth distinta impiden verificar y borrar", async () => {
  state.role = "admin"; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  state.role = "SuperAdmin"; state.linked = uuid(99); assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  assert.equal(state.challengeCount, 0); assert.equal(mutations().length, 0);
});
test("sesión sin Auth, sin factor verificado, challenge fallido y código incorrecto nunca borran", async () => {
  state.authUser = null; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  state.authUser = uuid(1); state.factors = []; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  state.factors = [{ id: uuid(2), status: "verified", factor_type: "totp" }];
  state.challengeFails = true; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  state.challengeFails = false; state.verifyFails = true; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  assert.equal(mutations().length, 0);
});
test("cada eliminación exige un challenge nuevo aun con sesión AAL2 y solo envía IDs seleccionados", async () => {
  for (const ids of [[uuid(10)], [uuid(10), uuid(12)]]) {
    const result = await eliminarRevisiones(ids, "123456"); assert.equal(result.error, null); assert.deepEqual(result.registro, record);
    const call = mutations().at(-1)!; assert.match(call.url.pathname, /rpc\/eliminar_revisiones_superadmin$/);
    assert.deepEqual(call.body, { p_actor_id: 7, p_auth_user_id: uuid(1), p_session_id: uuid(3), p_challenge_id: uuid(100 + state.challengeCount), p_ids: ids, p_ip: null });
    assert.doesNotMatch(JSON.stringify(call.body), /123456/);
  }
  assert.equal(state.challengeCount, 2); assert.equal(state.verifyCount, 2);
});
test("no se acepta una verificación sin sesión UUID y AAL2", async () => {
  state.sessionId = "invalid"; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  state.sessionId = uuid(3); state.aal = "aal1"; assert.ok((await eliminarRevisiones([uuid(10)], "123456")).error);
  assert.equal(mutations().length, 0);
});
test("IP proviene del encabezado controlado por Vercel, nunca de x-forwarded-for manipulable", async () => {
  const previous = process.env.VERCEL; process.env.VERCEL = "1";
  try {
    globals.__deleteHeaders = new Headers({ "x-vercel-forwarded-for": "2001:db8::1", "x-forwarded-for": "malicious value" });
    await eliminarRevisiones([uuid(10)], "123456"); assert.equal((mutations().at(-1)!.body as { p_ip: string }).p_ip, "2001:db8::1");
  } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
});
test("fallos transaccionales no reportan éxito ni exponen detalles de la base", async () => {
  for (const code of ["P0002", "42501", "XX000"]) {
    state.error = { code, message: "sensitive db details" };
    const result = await eliminarRevisiones([uuid(10)], "123456"); assert.equal(result.registro, null); assert.ok(result.error); assert.doesNotMatch(result.error, /sensitive/);
  }
});
test("últimos 200 usa fecha descendente, nulos al final y desempate estable", async () => {
  state.rows = Array.from({ length: 201 }, (_, i) => ({ id: uuid(1000 - i), casita: "1", quien_revisa: "Prueba", caja_fuerte: null, created_at: "2026-10-03T12:00:00.123456" }));
  const result = await fetchRevisionesParaEliminar(null, true); assert.equal(result.rows.length, 200); assert.ok(result.nextCursor);
  const query = state.calls[0].url.searchParams; assert.equal(query.get("limit"), "201"); assert.equal(query.get("order"), "created_at.desc.nullslast,id.desc");
  assert.equal(query.get("select"), "id,casita,quien_revisa,caja_fuerte,created_at");
});
test("paginación preserva microsegundos y permite filas sin fecha sin inyección", async () => {
  const cursor = { id: uuid(10), fecha: "2026-10-03T12:00:00.123456" };
  await fetchRevisionesParaEliminar(cursor); assert.match(state.calls.at(-1)!.url.searchParams.get("or")!, /123456/);
  await fetchRevisionesParaEliminar({ ...cursor, fecha: null }); assert.equal(state.calls.at(-1)!.url.searchParams.get("created_at"), "is.null");
  const count = state.calls.length;
  for (const c of [{ ...cursor, fecha: "x),id.neq.x" }, { ...cursor, id: "invalid" }, [], "invalid"]) {
    assert.equal(validDeleteCursor(c), false); assert.ok((await fetchRevisionesParaEliminar(c as never)).error);
  }
  assert.equal(state.calls.length, count);
});
test("historial solo devuelve los campos de auditoría de pantalla y ruta conserva Otros", async () => {
  state.rows = [record]; const result = await fetchRegistrosEliminados(); assert.deepEqual(result.rows, [record]);
  assert.equal(state.calls[0].url.searchParams.get("select"), "id,fecha,usuario_id,usuario,ip,cantidad");
  assert.equal(screenFromPath("/eliminar-revisiones/"), "otros"); assert.equal(screenFromSlug(["eliminar-revisiones"]), "otros");
});
