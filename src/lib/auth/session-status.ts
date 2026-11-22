import {
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";
import type { SesionUsuario } from "@/types/database";

export type SessionCheckResult =
  | { status: "active"; user: SesionUsuario }
  | { status: "inactive" }
  | { status: "transient_error" };

const DEFINITIVE_AUTH_CODES = new Set([
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "bad_jwt",
  "invalid_jwt",
  "user_not_found",
  "user_banned",
  "no_authorization",
]);

export function isDefinitiveAuthSessionFailure(error: unknown): boolean {
  if (!error || isAuthRetryableFetchError(error)) return false;
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthError(error)) return false;

  if (
    typeof error.status === "number" &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
  ) {
    return false;
  }

  if (error.name === "AuthInvalidJwtError") return true;
  if (error.code && DEFINITIVE_AUTH_CODES.has(error.code)) return true;
  if (isAuthApiError(error) && (error.status === 401 || error.status === 403)) return true;

  return false;
}
