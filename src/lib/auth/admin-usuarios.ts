import "server-only";

import type { User } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/server";
import { UsuarioAdminError } from "@/lib/usuarios-admin";

export type AuthUserRef = { id: string; email: string | null; provider: string | null };

function toRef(user: User): AuthUserRef {
  return {
    id: user.id,
    email: user.email ?? null,
    provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
  };
}

export function authErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/already registered|already been registered|already exists|duplicate key/i.test(message)) {
    return "Ese correo ya tiene una cuenta de acceso.";
  }
  if (/at least 6 characters|password.*(short|weak)|weak password/i.test(message)) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (/invalid email|email address is invalid/i.test(message)) {
    return "El correo no es válido.";
  }
  if (/user not found|does not exist/i.test(message)) {
    return "No encontramos la cuenta de acceso de ese correo.";
  }
  return fallback;
}

export async function listAuthUserEmails(): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  try {
    const admin = createAdminClient();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      for (const user of data.users) {
        if (user.email) emails.set(user.id, user.email);
      }
      if (data.users.length < 1000) break;
    }
  } catch {
    return emails;
  }
  return emails;
}

export async function getAuthUserById(id: string): Promise<AuthUserRef | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(id);
  if (error || !data.user) return null;
  return toRef(data.user);
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRef | null> {
  const target = normalizeEmail(email);
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizeEmail(user.email) === target);
    if (match) return toRef(match);
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function createAuthUser(email: string, password: string): Promise<AuthUserRef> {
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: normalizeEmail(email),
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new UsuarioAdminError(authErrorMessage(error, "No se pudo crear la cuenta de acceso."));
  return toRef(data.user);
}

export async function updateAuthUser(id: string, attributes: { email?: string; password?: string }): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(id, {
    ...(attributes.email ? { email: normalizeEmail(attributes.email), email_confirm: true } : {}),
    ...(attributes.password ? { password: attributes.password } : {}),
  });
  if (error) throw new UsuarioAdminError(authErrorMessage(error, "No se pudo actualizar la cuenta de acceso."));
}

export async function deleteAuthUser(id: string): Promise<boolean> {
  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(id);
    if (error) {
      console.error("No se pudo eliminar la cuenta de acceso del usuario.");
      return false;
    }
    return true;
  } catch {
    console.error("No se pudo eliminar la cuenta de acceso del usuario.");
    return false;
  }
}

export async function removeAuthFactors(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new UsuarioAdminError(authErrorMessage(error, "No se pudo consultar el Authenticator."));
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
    if (deleteError && !/not found/i.test(deleteError.message)) {
      throw new UsuarioAdminError(authErrorMessage(deleteError, "No se pudo borrar el Authenticator."));
    }
  }
}

export async function factorVerificado(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().auth.admin.mfa.listFactors({ userId });
  if (error) throw new UsuarioAdminError(authErrorMessage(error, "No se pudo consultar el Authenticator."));
  return data.factors.some((factor) => factor.status === "verified");
}

export async function authUserLinked(id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("Usuarios").select("id").eq("auth_user_id", id).limit(1);
  if (error) throw new UsuarioAdminError("No se pudo comprobar la cuenta de acceso.");
  return (data?.length ?? 0) > 0;
}
