import "server-only";

import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clearUsuarioSession, getUsuarioSession } from "@/lib/usuarios-session";
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

export async function getSupabaseUsuario() {
  try {
    const client = await createClient();
    const { data: current } = await client.auth.getSession();
    const subject = sessionSubject(current.session?.access_token);
    if (!subject) return null;
    const linked = fetchLinkedProfileByAuthId(subject).catch(() => null);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    const assurance = await getAssuranceLevel(client);
    if (!assurance) return null;
    if (isSessionExpired(assurance)) {
      await signOutLocal(client);
      return null;
    }

    const prefetched = data.user.id === subject ? await linked : null;
    const profile = prefetched ?? await fetchAuthorizedProfile(client, data.user);
    if (!profile || profile.Rol === "inactivo") return null;
    if (!hasCompletedAuthentication(assurance, profile, data.user)) return null;
    return { id: profile.id, nombre: profile.Usuario, rol: profile.Rol };
  } catch {
    return null;
  }
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

export async function getSesionUsuario() {
  return (await getUsuarioSession()) ?? getSupabaseUsuario();
}
