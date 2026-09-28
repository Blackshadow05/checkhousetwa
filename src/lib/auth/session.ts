import "server-only";

import { cookies } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clearUsuarioSession, getUsuarioSession } from "@/lib/usuarios-session";
import {
  fetchAuthorizedProfile,
  isGoogleProvider,
  linkAuthUserToProfile,
  type AuthProfile,
} from "@/lib/auth/profile";
import type { User } from "@supabase/supabase-js";

export const SUPABASE_SESSION_HOURS = 8;
const STARTED_AT_COOKIE = "casitas-auth-start";
const MAX_AGE = SUPABASE_SESSION_HOURS * 60 * 60;
type AuthClient = Awaited<ReturnType<typeof createClient>>;

export async function setStartedAt() {
  (await cookies()).set(STARTED_AT_COOKIE, new Date().toISOString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

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

async function hasCompletedAuthentication(client: AuthClient, profile: AuthProfile, user: User) {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  if (profile.metodo_login === "google") {
    return isGoogleProvider(user) && data.currentAuthenticationMethods.some((entry) => (typeof entry === "string" ? entry : entry.method) === "oauth");
  }
  return data.currentLevel === "aal2";
}

export async function getSupabaseUsuario() {
  try {
    const startedAt = (await cookies()).get(STARTED_AT_COOKIE)?.value;
    const startedAtMs = startedAt ? Date.parse(startedAt) : NaN;
    const age = Date.now() - startedAtMs;
    if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE * 1000) return null;

    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    const profile = await fetchAuthorizedProfile(client, data.user);
    if (!profile || profile.Rol === "inactivo") return null;
    if (!(await hasCompletedAuthentication(client, profile, data.user))) return null;
    return { id: profile.id, nombre: profile.Usuario, rol: profile.Rol };
  } catch {
    return null;
  }
}

// Only pass the user returned by a successful Auth server operation in this
// request (signInWithPassword, MFA verify or exchangeCodeForSession), never a
// user read from request data or getSession(). Keep the same updated client.
export async function completeSupabaseSession(client: AuthClient, profile: AuthProfile, verifiedUser: User) {
  if (!verifiedUser?.id || profile.Rol === "inactivo" || !(await hasCompletedAuthentication(client, profile, verifiedUser))) {
    throw new Error("No se pudo completar la sesión.");
  }
  const linked = await linkAuthUserToProfile(client, profile, verifiedUser);
  await clearUsuarioSession();
  await setStartedAt();
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
