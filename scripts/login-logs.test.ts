import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { fetchLoginLogs } from "@/app/actions/login-logs";
import { loginLogDay, loginLogDayLabel, loginLogMethod, loginLogTime, validLoginLogsCursor, type LoginLog } from "@/lib/login-logs";
import { screenFromPath, screenFromSlug } from "@/lib/navigation/screens";

const state = { requests: [] as URL[], rows: [] as LoginLog[], fail: false, clients: 0 };
const client = createClient("https://local-test.supabase.co", "test-publishable-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, options) => {
    assert.equal(options?.method, "GET");
    state.requests.push(new URL(String(input)));
    return new Response(JSON.stringify(state.fail ? { code: "XX000", message: "private database detail" } : state.rows), {
      status: state.fail ? 500 : 200, headers: { "Content-Type": "application/json" },
    });
  } },
});
const globals = globalThis as typeof globalThis & {
  __loginLogsSession: { id: number; rol: string } | null;
  __loginLogsClient: () => typeof client;
};
globals.__loginLogsClient = () => { state.clients++; return client; };

const row = (index: number): LoginLog => ({
  id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  usuario: "Usuario de prueba", ip_address: null, metodo: "password", logged_at: "2026-10-03T05:59:59.123456+00:00",
});

beforeEach(() => {
  globals.__loginLogsSession = { id: 7, rol: "admin" };
  state.requests = []; state.rows = []; state.fail = false; state.clients = 0;
});

test("hora y agrupación usan Costa Rica incluso cuando UTC ya cambió de día", () => {
  assert.equal(loginLogDay("2026-10-03T05:59:59Z"), "2026-10-02");
  assert.equal(loginLogDay("2026-10-03T06:00:00Z"), "2026-10-03");
  assert.match(loginLogTime("2026-10-03T05:59:59Z").replace(/\s/g, ""), /^11:59p\.m\.$/);
  assert.match(loginLogTime("2026-10-03T06:00:00Z").replace(/\s/g, ""), /^12:00a\.m\.$/);
  const now = new Date("2026-10-03T05:00:00Z");
  assert.match(loginLogDayLabel("2026-10-03T04:00:00Z", now), /^Hoy/);
  assert.match(loginLogDayLabel("2026-10-02T04:00:00Z", now), /^Ayer/);
  assert.equal(loginLogMethod("password"), "Contraseña");
  assert.equal(loginLogMethod("authenticator"), "Authenticator");
  assert.equal(loginLogMethod("google"), "Google");
});

test("la ruta abre Otros tanto en cliente como desde una URL directa", () => {
  assert.equal(screenFromPath("/historial-accesos/"), "otros");
  assert.equal(screenFromSlug(["historial-accesos"]), "otros");
});

test("sin sesión o con un rol común no se crea ni consulta el cliente privado", async () => {
  for (const rol of [null, "user", "inactivo"]) {
    globals.__loginLogsSession = rol ? { id: 7, rol } : null;
    const result = await fetchLoginLogs();
    assert.equal(result.denied, true); assert.equal(result.snapshot, null);
    assert.equal(state.clients, 0); assert.equal(state.requests.length, 0);
  }
});

test("ambos roles administradores reciben solo los campos necesarios y una página acotada", async () => {
  state.rows = Array.from({ length: 51 }, (_, i) => row(51 - i));
  for (const rol of ["admin", "SuperAdmin"]) {
    globals.__loginLogsSession = { id: 7, rol };
    const result = await fetchLoginLogs();
    assert.equal(result.error, null); assert.equal(result.snapshot?.ownerId, 7);
    assert.equal(result.snapshot?.rows.length, 50);
    assert.deepEqual(result.snapshot?.nextCursor, { id: row(2).id, loggedAt: row(2).logged_at });
    const url = state.requests.at(-1)!;
    assert.equal(url.searchParams.get("select"), "id,usuario,ip_address,metodo,logged_at");
    assert.equal(url.searchParams.get("order"), "logged_at.desc,id.desc");
    assert.equal(url.searchParams.get("limit"), "51");
  }
});

test("la página siguiente conserva microsegundos y desempata registros con la misma hora por ID", async () => {
  const cursor = { loggedAt: row(2).logged_at, id: row(2).id };
  state.rows = [row(1)];
  const result = await fetchLoginLogs(cursor);
  assert.equal(result.snapshot?.nextCursor, null);
  assert.deepEqual(result.snapshot?.rows, [row(1)]);
  assert.equal(state.requests[0].searchParams.get("or"), `(logged_at.lt.${cursor.loggedAt},and(logged_at.eq.${cursor.loggedAt},id.lt.${cursor.id}))`);
});

test("cursores manipulados no llegan a la base de datos", async () => {
  for (const value of [{ id: row(1).id, loggedAt: "invalid" }, { id: "x),usuario.neq.x", loggedAt: row(1).logged_at }, [], "invalid"]) {
    assert.equal(validLoginLogsCursor(value), false);
    const result = await fetchLoginLogs(value as never);
    assert.ok(result.error); assert.equal(result.snapshot, null);
  }
  assert.equal(state.clients, 0);
});

test("un historial vacío se distingue de un error sin exponer detalles internos", async () => {
  assert.deepEqual((await fetchLoginLogs()).snapshot?.rows, []);
  state.fail = true;
  const result = await fetchLoginLogs();
  assert.equal(result.snapshot, null); assert.ok(result.error);
  assert.doesNotMatch(result.error, /private database/);
});
