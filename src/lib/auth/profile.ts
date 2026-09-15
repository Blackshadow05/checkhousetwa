import "server-only";

import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

export const PROFILE_COLUMNS = "id,Usuario,Rol,metodo_login,email,auth_user_id,totp_enrolled";

export type AuthProfile = {
  id: number;
  Usuario: string;
  Rol: string | null;
  metodo_login: string;
  email: string | null;
  auth_user_id: string | null;
  totp_enrolled: boolean;
};

type AuthClient = Awaited<ReturnType<typeof createClient>>;

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function toProfile(row: unknown): AuthProfile | null {
  if (
    !row || typeof row !== "object" ||
    !("id" in row) || typeof row.id !== "number" || !Number.isSafeInteger(row.id) ||
    !("Usuario" in row) || typeof row.Usuario !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    Usuario: row.Usuario,
    Rol: "Rol" in row && typeof row.Rol === "string" ? row.Rol : null,
    metodo_login: "metodo_login" in row && typeof row.metodo_login === "string" && row.metodo_login
      ? row.metodo_login
      : "password",
    email: "email" in row && typeof row.email === "string" && row.email ? row.email : null,
    auth_user_id: "auth_user_id" in row && typeof row.auth_user_id === "string" && row.auth_user_id
      ? row.auth_user_id
      : null,
    totp_enrolled: "totp_enrolled" in row && row.totp_enrolled === true,
  };
}

export function isGoogleProvider(authUser: User): boolean {
  return authUser.app_metadata.provider === "google" ||
    (authUser.identities?.some((identity) => identity.provider === "google") ?? false);
}

function emailPattern(email: string): string {
  return email.replace(/[\\%_]/g, "\\$&");
}

export async function fetchProfileForAuthUser(
  client: AuthClient,
  authUser: User,
): Promise<AuthProfile | null> {
  const byId = await client
    .from("Usuarios")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (byId.error) throw byId.error;
  if (byId.data) return toProfile(byId.data);

  const email = normalizeEmail(authUser.email);
  if (!email) return null;

  const byEmail = await client
    .from("Usuarios")
    .select(PROFILE_COLUMNS)
    .ilike("email", emailPattern(email))
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  const profile = toProfile(byEmail.data);
  return profile && normalizeEmail(profile.email) === email ? profile : null;
}

export async function fetchGoogleProfile(
  client: AuthClient,
  authUser: User,
): Promise<AuthProfile | null> {
  const email = normalizeEmail(authUser.email);
  if (!email) return null;

  const { data, error } = await client
    .from("Usuarios")
    .select(PROFILE_COLUMNS)
    .eq("metodo_login", "google")
    .ilike("email", emailPattern(email))
    .maybeSingle();

  if (error) throw error;
  const profile = toProfile(data);
  return profile && normalizeEmail(profile.email) === email ? profile : null;
}

export async function fetchAuthorizedProfile(
  client: AuthClient,
  authUser: User,
): Promise<AuthProfile | null> {
  return isGoogleProvider(authUser)
    ? fetchGoogleProfile(client, authUser)
    : fetchProfileForAuthUser(client, authUser);
}

export async function linkAuthUserToProfile(
  client: AuthClient,
  profile: AuthProfile,
  authUser: User,
): Promise<AuthProfile> {
  const email = normalizeEmail(authUser.email || profile.email) || null;
  if (profile.auth_user_id === authUser.id && profile.email === email) return profile;

  const { data, error } = await client
    .from("Usuarios")
    .update({ auth_user_id: authUser.id, email })
    .eq("id", profile.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  const linked = toProfile(data);
  if (!linked) throw new Error("No se pudo vincular el usuario.");
  return linked;
}

export async function markTotpEnrolled(
  client: AuthClient,
  profile: AuthProfile,
): Promise<AuthProfile> {
  if (profile.totp_enrolled) return profile;

  const { data, error } = await client
    .from("Usuarios")
    .update({ totp_enrolled: true })
    .eq("id", profile.id)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  const enrolled = toProfile(data);
  if (!enrolled || !enrolled.totp_enrolled) {
    throw new Error("No se pudo guardar la configuración de Authenticator.");
  }
  return enrolled;
}
