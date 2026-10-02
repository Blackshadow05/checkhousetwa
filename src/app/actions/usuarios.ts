"use server";

import { headers } from "next/headers";
import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { clearUsuarioSession, setUsuarioSession } from "@/lib/usuarios-session";
import {
  fetchAuthorizedProfile,
  fetchProfileForAuthUser,
  linkAuthUserToProfile,
  markTotpEnrolled,
  normalizeEmail,
} from "@/lib/auth/profile";
import {
  clearStartedAt,
  clearSupabaseSession,
  completeSupabaseSession,
  getSesionUsuario,
  signOutLocal,
} from "@/lib/auth/session";
import { recordLogin } from "@/lib/auth/record-login";

type AuthClient = Awaited<ReturnType<typeof createClient>>;
type LoginResult =
  | { error: string; user: null; useGoogle?: true; useAuthenticator?: true; restartAuthenticator?: true }
  | { error: null; user: { id: number; nombre: string } };
type AuthenticatorResult = LoginResult
  | { error: null; step: "challenge"; factorId: string }
  | { error: null; step: "enroll"; factorId: string; qrCode: string; secret: string | null };

const DUPLICATE_FACTOR_RE = /friendly name|already exists|already been enrolled/i;
const DEFAULT_TOTP_NAME = "Google Authenticator";
const UNAUTHORIZED = "Tu correo no está autorizado. Contacte al administrador.";
const INACTIVE = "Usuario inactivo. Contacte al administrador.";
const GOOGLE_ONLY = "Esta cuenta entra con Google. Usa el botón de Google.";
const LOGIN_ERROR = "No se pudo iniciar sesión. Revisa tu conexión o la configuración de acceso.";

function authenticatorFailure(error: unknown): LoginResult {
  if (isAuthSessionMissingError(error) || (isAuthError(error) && [
    "session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "bad_jwt", "user_not_found",
  ].includes(error.code || ""))) {
    return { error: "La sesión de Authenticator venció. Vuelve a ingresar tu correo y contraseña de Auth.", user: null, restartAuthenticator: true };
  }
  if (isAuthError(error) && error.code === "mfa_factor_not_found") {
    return { error: "El Authenticator seleccionado ya no está disponible. Vuelve a ingresar con tu correo y contraseña de Auth.", user: null, restartAuthenticator: true };
  }
  if (isAuthError(error) && error.code === "mfa_verification_failed") {
    return { error: "Código incorrecto o vencido. Inténtalo de nuevo.", user: null };
  }
  return { error: "No pudimos comprobar Authenticator. Revisa tu conexión y vuelve a intentarlo.", user: null };
}

async function rejectAuthSession(client: AuthClient, error: string) {
  await signOutLocal(client);
  await clearStartedAt();
  return { error, user: null };
}

async function listTotpFactors(client: AuthClient) {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  const factors = data.all.filter((factor) => factor.factor_type === "totp");
  return factors.length ? factors : data.totp;
}

async function removeUnverifiedTotpFactors(client: AuthClient, factors?: Awaited<ReturnType<typeof listTotpFactors>>) {
  factors ??= await listTotpFactors(client);
  for (const factor of factors) {
    if (factor.status !== "verified") {
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) console.error("No se pudo eliminar un factor de Authenticator pendiente.");
    }
  }
}

function totpSecret(totp: { secret?: string; uri?: string }) {
  const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, "").toUpperCase() || null;
  const secret = normalize(totp.secret);
  if (secret) return secret;
  try {
    return normalize(new URL(totp.uri || "").searchParams.get("secret"));
  } catch {
    return null;
  }
}

type EnrollResponse = Awaited<ReturnType<typeof enrollTotpFactor>>;

async function enrollTotpFactor(client: AuthClient) {
  let enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: DEFAULT_TOTP_NAME });
  if (enrollment.error && DUPLICATE_FACTOR_RE.test(enrollment.error.message)) {
    await removeUnverifiedTotpFactors(client);
    enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: DEFAULT_TOTP_NAME });
  }
  if (enrollment.error && DUPLICATE_FACTOR_RE.test(enrollment.error.message)) {
    enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `${DEFAULT_TOTP_NAME} ${Date.now()}` });
  }
  return enrollment;
}

function enrollmentResult(enrollment: EnrollResponse): AuthenticatorResult {
  if (enrollment.error) {
    const message = DUPLICATE_FACTOR_RE.test(enrollment.error.message)
      ? "Este Authenticator quedó a medias. Genera un QR nuevo o pide a un administrador que lo resetee en Usuarios."
      : enrollment.error.message || "No se pudo generar el código de Authenticator";
    return { error: message, user: null };
  }
  return {
    error: null,
    step: "enroll",
    factorId: enrollment.data.id,
    qrCode: enrollment.data.totp.qr_code,
    secret: totpSecret(enrollment.data.totp),
  };
}

export async function currentUsuario() {
  return getSesionUsuario();
}

export async function logoutUsuario() {
  try {
    await clearUsuarioSession();
  } finally {
    await clearSupabaseSession();
  }
}

export async function loginUsuario(username: string, password: string): Promise<LoginResult> {
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 100 || password.length > 256) {
    return { error: "Ingresa tu usuario y contraseña.", user: null };
  }
  try {
    const client = await createClient();
    const { data, error } = await createAdminClient().from("Usuarios").select("id,Usuario,Rol,metodo_login,totp_enrolled").eq("Usuario", username.trim()).eq("password_hash", password).single();
    if (error || !data) return { error: "Usuario o contraseña incorrectos.", user: null };
    if (data.Rol === "inactivo") return await rejectAuthSession(client, INACTIVE);
    if (data.metodo_login === "google") {
      return { ...await rejectAuthSession(client, "Este usuario entra con Google. Usa el botón de Google."), useGoogle: true };
    }
    if (data.totp_enrolled) {
      return { ...await rejectAuthSession(client, "Tu cuenta ya usa Google Authenticator. Entra con el botón Authenticator."), useAuthenticator: true };
    }
    await setUsuarioSession(data.id);
    await signOutLocal(client);
    await clearStartedAt();
    await recordLogin({ userId: data.id, usuario: data.Usuario, metodo: "password" });
    return { error: null, user: { id: data.id, nombre: data.Usuario } };
  } catch (error) {
    console.error("loginUsuario", error);
    return { error: LOGIN_ERROR, user: null };
  }
}

export async function loginConAuthenticator(email: string, password: string): Promise<AuthenticatorResult> {
  if (typeof email !== "string" || typeof password !== "string" || !normalizeEmail(email) || !password) {
    return { error: "Correo o contraseña incorrectos.", user: null };
  }
  let client: AuthClient | undefined;
  try {
    client = await createClient();
    await clearStartedAt();
    const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error || !data.user) return await rejectAuthSession(client, "Correo o contraseña incorrectos.");

    let profile = await fetchProfileForAuthUser(client, data.user);
    if (!profile) return await rejectAuthSession(client, UNAUTHORIZED);
    if (profile.Rol === "inactivo") return await rejectAuthSession(client, INACTIVE);
    if (profile.metodo_login === "google") return await rejectAuthSession(client, GOOGLE_ONLY);
    profile = await linkAuthUserToProfile(client, profile, data.user);
    await clearUsuarioSession();

    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance?.currentLevel === "aal2") {
      profile = await markTotpEnrolled(client, profile);
      const user = await completeSupabaseSession(client, profile, data.user);
      await recordLogin({ userId: user.id, usuario: user.nombre, metodo: "authenticator", accessToken: data.session?.access_token });
      return { error: null, user };
    }

    // This user came from the Auth server, not from browser-supplied cookies.
    const factors = data.user.factors?.filter((factor) => factor.factor_type === "totp")
      ?? await listTotpFactors(client);
    const verified = factors.find((factor) => factor.status === "verified");
    if (verified) return { error: null, step: "challenge", factorId: verified.id };

    await removeUnverifiedTotpFactors(client, factors);
    return enrollmentResult(await enrollTotpFactor(client));
  } catch (error) {
    console.error("loginConAuthenticator", error);
    if (client) return await rejectAuthSession(client, LOGIN_ERROR);
    return { error: LOGIN_ERROR, user: null };
  }
}

export async function regenerarQrAuthenticator(): Promise<AuthenticatorResult> {
  let client: AuthClient | undefined;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return { error: "Vuelve a entrar con Authenticator para generar un QR nuevo.", user: null };
    }
    const profile = await fetchAuthorizedProfile(client, data.user);
    if (!profile) return await rejectAuthSession(client, UNAUTHORIZED);
    if (profile.Rol === "inactivo") return await rejectAuthSession(client, INACTIVE);
    if (profile.metodo_login === "google") return await rejectAuthSession(client, GOOGLE_ONLY);
    await linkAuthUserToProfile(client, profile, data.user);
    const factors = data.user.factors?.filter((factor) => factor.factor_type === "totp")
      ?? await listTotpFactors(client);
    const verified = factors.find((factor) => factor.status === "verified");
    if (verified) return { error: null, step: "challenge", factorId: verified.id };
    await removeUnverifiedTotpFactors(client, factors);
    return enrollmentResult(await enrollTotpFactor(client));
  } catch (error) {
    return authenticatorFailure(error);
  }
}

export async function verificarCodigoAuthenticator(factorId: string, codigo: string): Promise<LoginResult> {
  if (typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) {
    return { error: "El código debe tener 6 dígitos", user: null };
  }
  if (typeof factorId !== "string" || !factorId) {
    return { error: "Vuelve a ingresar con tu correo y contraseña de Auth para verificar el código.", user: null, restartAuthenticator: true };
  }
  try {
    const client = await createClient();
    const factors = await listTotpFactors(client);
    if (!factors.some((factor) => factor.id === factorId)) {
      return { error: "El Authenticator seleccionado ya no está disponible. Vuelve a ingresar con tu correo y contraseña de Auth.", user: null, restartAuthenticator: true };
    }
    const challenge = await client.auth.mfa.challenge({ factorId });
    if (challenge.error) throw challenge.error;
    const verify = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: codigo });
    if (verify.error) throw verify.error;

    const verifiedUser = verify.data.user;
    if (!verifiedUser) return await rejectAuthSession(client, UNAUTHORIZED);
    let profile = await fetchAuthorizedProfile(client, verifiedUser);
    if (!profile) return await rejectAuthSession(client, UNAUTHORIZED);
    if (profile.Rol === "inactivo") return await rejectAuthSession(client, INACTIVE);
    if (profile.metodo_login === "google") return await rejectAuthSession(client, GOOGLE_ONLY);
    profile = await markTotpEnrolled(client, profile);
    const user = await completeSupabaseSession(client, profile, verifiedUser);
    await recordLogin({ userId: user.id, usuario: user.nombre, metodo: "authenticator", accessToken: verify.data.access_token });
    return { error: null, user };
  } catch (error) {
    return authenticatorFailure(error);
  }
}

export async function iniciarLoginGoogle(): Promise<{ error: string | null; url: string | null }> {
  try {
    const requestHeaders = await headers();
    const host = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"))?.split(",")[0].trim();
    if (!host) return { error: "No se pudo abrir Google", url: null };
    const hostname = new URL(`http://${host}`).hostname;
    const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim() || (local ? "http" : "https");
    const origin = new URL(`${protocol}://${host}`);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      return { error: "No se pudo abrir Google", url: null };
    }
    const client = await createClient();
    await clearStartedAt();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin.origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) return { error: error?.message || "No se pudo abrir Google", url: null };
    return { error: null, url: data.url };
  } catch {
    return { error: "No se pudo abrir Google", url: null };
  }
}

export async function cancelarAuthenticator() {
  try {
    await signOutLocal(await createClient());
  } finally {
    await clearStartedAt();
  }
}
