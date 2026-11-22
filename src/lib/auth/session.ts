import "server-only";

import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { checkUsuarioSession, clearUsuarioSession } from "@/lib/usuarios-session";
import { isDefinitiveAuthSessionFailure, type SessionCheckResult } from "@/lib/auth/session-status";
import {
  fetchAuthorizedProfile,
  fetchLinkedProfileByAuthId,
  isGoogleProvider,
  linkAuthUserToProfile,
  permiteGoogle,
  type AuthProfile,
} from "@/lib/auth/profile";
import type { AMREntry, User } from "@supabase/supabase-js";

export const SUPABASE_SESSION_HOURS = 8;
const STARTED_AT_COOKIE = "casitas-auth-start";
const MAX_AGE_MS = SUPABASE_SESSION_HOURS * 60 * 60 * 1000;
type AuthClient = Awaited<ReturnType<typeof createClient>>;
type AssuranceLevel = NonNullable<Awaited<ReturnType<AuthClient["auth"]["mfa"]["getAuthenticatorAssuranceLevel"]>>["data"]>;

export async function clearStartedAt() {
  (await cookies()).delete(STARTED_AT_COOKIE);
}

export async function signOutLocal(client: AuthClient) {
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) console.error("No se pudo cerrar la sesión local de Supabase.");
  } catch {
    console.error("No se pudo cerrar la sesión local de Supabase.");
  }
}

export async function clearSupabaseSession() {
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "global" });
    if (error) console.error("No se pudo cerrar la sesión global de Supabase.");
  } catch {
    console.error("No se pudo cerrar la sesión global de Supabase.");
  } finally {
    await clearStartedAt();
  }
}

async function getAssuranceLevel(client: AuthClient) {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return error || !data ? null : data;
}

function isSessionExpired(data: AssuranceLevel) {
  const timestamps = (data.currentAuthenticationMethods as (AMREntry | string)[])
    .flatMap((entry) => (typeof entry === "string" || !Number.isFinite(entry.timestamp) ? [] : [entry.timestamp * 1000]));
  if (!timestamps.length) return true;
  const age = Date.now() - Math.min(...timestamps);
  return age < -60_000 || age >= MAX_AGE_MS;
}

function usesGoogleSession(data: AssuranceLevel) {
  return data.currentAuthenticationMethods.some((entry) => (typeof entry === "string" ? entry : entry.method) === "oauth");
}

function sessionMethodAllowed(data: AssuranceLevel, profile: AuthProfile, user: User) {
  return usesGoogleSession(data)
    ? permiteGoogle(profile) && isGoogleProvider(user)
    : profile.metodo_login !== "google";
}

function hasCompletedAuthentication(data: AssuranceLevel, profile: AuthProfile, user: User) {
  return data.currentLevel === "aal2" && sessionMethodAllowed(data, profile, user);
}

export async function getPendingSession(client: AuthClient, profile: AuthProfile, user: User) {
  const assurance = await getAssuranceLevel(client);
  if (!assurance || isSessionExpired(assurance)) return null;
  return {
    metodo: usesGoogleSession(assurance) ? "google" as const : "correo" as const,
    permitido: sessionMethodAllowed(assurance, profile, user),
  };
}

function sessionSubject(accessToken: string | undefined) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken?.split(".")[1] ?? "", "base64url").toString());
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function checkSupabaseUsuario(): Promise<SessionCheckResult> {
  try {
    const client = await createClient();
    const { data: current, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      return isDefinitiveAuthSessionFailure(sessionError)
        ? { status: "inactive" }
        : { status: "transient_error" };
    }
    const subject = sessionSubject(current.session?.access_token);
    if (!subject) return { status: "inactive" };
    const linked = fetchLinkedProfileByAuthId(subject).catch(() => null);
    const { data, error } = await client.auth.getUser();
    if (error) {
      return isDefinitiveAuthSessionFailure(error)
        ? { status: "inactive" }
        : { status: "transient_error" };
    }
    if (!data.user) return { status: "inactive" };

    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      return isDefinitiveAuthSessionFailure(assuranceError)
        ? { status: "inactive" }
        : { status: "transient_error" };
    }
    if (!assurance) return { status: "inactive" };
    if (isSessionExpired(assurance)) {
      await signOutLocal(client);
      return { status: "inactive" };
    }

    const prefetched = data.user.id === subject ? await linked : null;
    const profile = prefetched ?? await fetchAuthorizedProfile(client, data.user);
    if (!profile || profile.Rol === "inactivo") return { status: "inactive" };
    if (!hasCompletedAuthentication(assurance, profile, data.user)) return { status: "inactive" };
    return { status: "active", user: { id: profile.id, nombre: profile.Usuario, rol: profile.Rol } };
  } catch {
    return { status: "transient_error" };
  }
}

export async function getSupabaseUsuario() {
  const result = await checkSupabaseUsuario();
  return result.status === "active" ? result.user : null;
}

// Only pass the user returned by a successful Auth server operation in this
// request (signInWithPassword, MFA verify or exchangeCodeForSession), never a
// user read from request data or getSession(). Keep the same updated client.
export async function completeSupabaseSession(client: AuthClient, profile: AuthProfile, verifiedUser: User) {
  const assurance = await getAssuranceLevel(client);
  if (!verifiedUser?.id || profile.Rol === "inactivo" || !assurance || isSessionExpired(assurance) || !hasCompletedAuthentication(assurance, profile, verifiedUser)) {
    throw new Error("No se pudo completar la sesión.");
  }
  const linked = await linkAuthUserToProfile(client, profile, verifiedUser);
  await clearUsuarioSession();
  await clearStartedAt();
  return { id: linked.id, nombre: linked.Usuario, rol: linked.Rol };
}

export async function createPrivateClient() {
  if (!(await getSesionUsuario())) throw new Error("Inicia sesión para acceder a estos datos.");
  return createAdminClient();
}

export async function createPrivateSession() {
  const usuario = await getSesionUsuario();
  return usuario ? { usuario, client: createAdminClient() } : null;
}

export async function checkSesionUsuario(): Promise<SessionCheckResult> {
  const local = await checkUsuarioSession();
  if (local.status !== "inactive") return local;
  return checkSupabaseUsuario();
}

export async function getSesionUsuario() {
  const result = await checkSesionUsuario();
  return result.status === "active" ? result.user : null;
}
