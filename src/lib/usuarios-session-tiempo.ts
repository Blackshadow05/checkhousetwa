// Lifetime of the temporary username/password session. It lives only in the
// device's cookie (the browser deletes it after this time); Supabase Auth and
// the Google/Authenticator sessions are not affected.
export const USUARIO_SESSION_HOURS = 9;
export const USUARIO_SESSION_MAX_AGE = USUARIO_SESSION_HOURS * 60 * 60;
// Cookies issued before the 9 h limit lasted 6 days and carry no start time.
const LEGACY_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60_000;

export type UsuarioSessionPayload = { id: number; iat?: number; expires: number };

export function nuevoPayloadUsuario(id: number, now = Date.now()): UsuarioSessionPayload {
  return { id, iat: now, expires: now + USUARIO_SESSION_MAX_AGE * 1000 };
}

export function payloadUsuarioVigente(payload: unknown, now = Date.now()): payload is UsuarioSessionPayload {
  if (!payload || typeof payload !== "object") return false;
  const { id, iat, expires } = payload as Partial<UsuarioSessionPayload>;
  if (!Number.isInteger(id) || typeof expires !== "number" || !(expires > now)) return false;
  const start = typeof iat === "number" ? iat : expires - LEGACY_MAX_AGE_MS;
  const age = now - start;
  return Number.isFinite(age) && age >= -CLOCK_SKEW_MS && age < USUARIO_SESSION_MAX_AGE * 1000;
}
