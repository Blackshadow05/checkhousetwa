import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST as jev } from "@/app/api/pantallas/jev/route";
import { POST as vision } from "@/app/api/pantallas/vision/route";

const originalFetch = globalThis.fetch;
let providerCalls = 0;
beforeEach(() => {
  Object.assign(globalThis, { __securitySession: null });
  process.env.TYPESAFE_API_KEY = "test-only";
  process.env.OPENAI_API_KEY = "test-only";
  providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls++;
    return new Response("{}", { status: 503 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "__securitySession");
});

const routes = [
  { name: "Jev", post: jev, body: { candidates: [{ id: 1, metrics: {
    circularity: 0.9, axisRatio: 0.9, contrastPeak: 40, edgeSharpness: 5,
    radialFalloff: 20, relativeDiameter: 0.03,
  } }] } },
  { name: "Visión", post: vision, body: { image: "AQ==", candidates: [{ id: 1, x: 0.5, y: 0.5 }] } },
];
for (const route of routes) {
  test(`${route.name}: sin sesión devuelve 401 antes de leer el cuerpo o llamar a IA`, async () => {
    const request = new Request("http://localhost/api/test", { method: "POST" });
    let reads = 0;
    request.json = async () => { reads++; throw new Error("No debe leer el cuerpo"); };
    const response = await route.post(request);
    assert.equal(response.status, 401);
    assert.equal(reads, 0);
    assert.equal(providerCalls, 0);
    assert.match((await response.json()).error, /Inicia sesión/);
  });
  test(`${route.name}: con sesión conserva la validación del cuerpo`, async () => {
    Object.assign(globalThis, { __securitySession: { id: 1, nombre: "Prueba", rol: "user" } });
    const response = await route.post(new Request("http://localhost/api/test", { method: "POST", body: "{" }));
    assert.equal(response.status, 400);
    assert.equal(providerCalls, 0);
  });
  test(`${route.name}: una sesión y un cuerpo válidos permiten llamar al proveedor simulado`, async () => {
    Object.assign(globalThis, { __securitySession: { id: 1, nombre: "Prueba", rol: "user" } });
    const response = await route.post(new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify(route.body) }));
    assert.equal(providerCalls, 1);
    assert.equal(response.status, 502);
  });
}
