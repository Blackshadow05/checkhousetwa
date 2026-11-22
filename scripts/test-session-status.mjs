import assert from "node:assert/strict";
import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { isDefinitiveAuthSessionFailure } from "../src/lib/auth/session-status.ts";

// Fallos transitorios (red, 5xx, timeout, rate limit): NO deben cerrar sesión.
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthRetryableFetchError("Failed to fetch", 0)),
  false,
  "AuthRetryableFetchError es transitorio",
);
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthRetryableFetchError("Bad gateway", 502)),
  false,
  "502 retryable es transitorio",
);
for (const status of [0, 408, 429, 500, 502, 503, 504]) {
  assert.equal(
    isDefinitiveAuthSessionFailure(new AuthApiError("upstream error", status, "unexpected_failure")),
    false,
    `AuthApiError HTTP ${status} es transitorio`,
  );
}
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthUnknownError("network blip", new TypeError("fetch failed"))),
  false,
  "AuthUnknownError es transitorio",
);
assert.equal(
  isDefinitiveAuthSessionFailure(new TypeError("fetch failed")),
  false,
  "TypeError de fetch es transitorio",
);
assert.equal(isDefinitiveAuthSessionFailure(null), false, "null no es fallo definitivo");

// Fallos definitivos de sesión: SÍ deben cerrar sesión.
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthSessionMissingError()),
  true,
  "AuthSessionMissingError confirma sesión inactiva",
);
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthInvalidJwtError("invalid jwt")),
  true,
  "AuthInvalidJwtError confirma sesión inactiva",
);
for (const code of [
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "invalid_jwt",
  "user_not_found",
  "user_banned",
  "no_authorization",
]) {
  assert.equal(
    isDefinitiveAuthSessionFailure(new AuthApiError("invalid session", 400, code)),
    true,
    `código ${code} confirma sesión inactiva`,
  );
}
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthApiError("unauthorized", 401, undefined)),
  true,
  "HTTP 401 confirma sesión inactiva",
);
assert.equal(
  isDefinitiveAuthSessionFailure(new AuthApiError("forbidden", 403, undefined)),
  true,
  "HTTP 403 confirma sesión inactiva",
);

console.log("test-session-status: OK");
