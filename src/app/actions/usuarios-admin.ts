"use server";

import {
  authUserLinked,
  createAuthUser,
  deleteAuthUser,
  factorVerificado,
  findAuthUserByEmail,
  getAuthUserById,
  listAuthUserEmails,
  removeAuthFactors,
  updateAuthUser,
} from "@/lib/auth/admin-usuarios";
import { normalizeEmail } from "@/lib/auth/profile";
import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { esRolAdmin, metodoAdminDe, UsuarioAdminError, validarUsuarioAdmin, type AdminUsuario, type AdminUsuarioInput } from "@/lib/usuarios-admin";
import type { SesionUsuario } from "@/types/database";

const COLUMNS = "id,Usuario,Rol,metodo_login,totp_enrolled,email,auth_user_id,ultimo_login_at,password_hash";

type UsuarioRow = {
  id: number;
  Usuario: string;
  Rol: string | null;
  metodo_login: string | null;
  totp_enrolled: boolean;
  email: string | null;
  auth_user_id: string | null;
  ultimo_login_at: string | null;
  password_hash: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;
type Guard = { error: string | null; admin: SesionUsuario | null };

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof UsuarioAdminError) return error.message;
  return fallback;
}

async function requireAdmin(): Promise<Guard> {
  const user = await getSesionUsuario();
  if (!user) return { error: "Inicia sesión para continuar.", admin: null };
  if (!esRolAdmin(user.rol)) return { error: "Solo los administradores pueden gestionar usuarios.", admin: null };
  return { error: null, admin: user };
}

function mapUsuario(row: UsuarioRow, authEmail: string | null = null): AdminUsuario {
  return {
    id: row.id,
    nombre: row.Usuario,
    rol: row.Rol ?? "user",
    metodo: metodoAdminDe(row),
    email: row.email ?? authEmail,
    authUserId: row.auth_user_id,
    totpEnrolled: row.totp_enrolled,
    ultimoLogin: row.ultimo_login_at,
  };
}

async function leerUsuario(admin: AdminClient, id: number): Promise<UsuarioRow | null> {
  const { data, error } = await admin.from("Usuarios").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new UsuarioAdminError("No se pudo consultar el usuario.");
  return data ?? null;
}

function likePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function nombreEnUso(admin: AdminClient, nombre: string, excepto: number | null): Promise<boolean> {
  let query = admin.from("Usuarios").select("id").ilike("Usuario", likePattern(nombre)).limit(1);
  if (excepto !== null) query = query.neq("id", excepto);
  const { data, error } = await query;
  if (error) throw new UsuarioAdminError("No se pudo comprobar el nombre.");
  return (data?.length ?? 0) > 0;
}

async function emailEnUso(admin: AdminClient, email: string, excepto: number | null): Promise<boolean> {
  let query = admin.from("Usuarios").select("id").ilike("email", likePattern(email)).limit(1);
  if (excepto !== null) query = query.neq("id", excepto);
  const { data, error } = await query;
  if (error) throw new UsuarioAdminError("No se pudo comprobar el correo.");
  return (data?.length ?? 0) > 0;
}

async function otroAdminActivo(admin: AdminClient, excepto: number): Promise<boolean> {
  const { data, error } = await admin.from("Usuarios").select("id").in("Rol", ["admin", "SuperAdmin"]).neq("id", excepto).limit(1);
  if (error) throw new UsuarioAdminError("No se pudo comprobar los administradores.");
  return (data?.length ?? 0) > 0;
}

async function detachAuth(admin: AdminClient, id: number): Promise<void> {
  const { error } = await admin.from("Usuarios").update({ auth_user_id: null }).eq("id", id);
  if (error) throw new UsuarioAdminError("No se pudo actualizar la cuenta de acceso.");
}

export async function adminListarUsuarios(): Promise<{ error: string | null; usuarios: AdminUsuario[] }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error, usuarios: [] };
    const admin = createAdminClient();
    const [rows, emails] = await Promise.all([
      admin.from("Usuarios").select(COLUMNS).order("Usuario"),
      listAuthUserEmails(),
    ]);
    if (rows.error) return { error: "No pudimos cargar los usuarios.", usuarios: [] };
    return {
      error: null,
      usuarios: (rows.data ?? []).map((row) => mapUsuario(row, row.auth_user_id ? emails.get(row.auth_user_id) ?? null : null)),
    };
  } catch {
    return { error: "No pudimos cargar los usuarios.", usuarios: [] };
  }
}

export async function adminCrearUsuario(input: AdminUsuarioInput): Promise<{ error: string | null; usuario: AdminUsuario | null }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error, usuario: null };
    const invalid = validarUsuarioAdmin(input, true);
    if (invalid) return { error: invalid, usuario: null };
    if (input.rol === "SuperAdmin" && guard.admin.rol !== "SuperAdmin") {
      return { error: "Solo un super administrador puede crear ese rol.", usuario: null };
    }
    const admin = createAdminClient();
    const nombre = input.nombre.trim();
    const email = input.metodo === "usuario" ? null : normalizeEmail(input.email);
    if (await nombreEnUso(admin, nombre, null)) return { error: "Ya existe un usuario con ese nombre.", usuario: null };
    if (email && await emailEnUso(admin, email, null)) return { error: "Ya existe un usuario con ese correo.", usuario: null };

    let authUserId: string | null = null;
    if (input.metodo === "correo" && email) {
      const existing = await findAuthUserByEmail(email);
      if (existing) {
        if (await authUserLinked(existing.id)) return { error: "Ese correo ya tiene una cuenta de acceso en uso.", usuario: null };
        await updateAuthUser(existing.id, { email, password: input.password });
        authUserId = existing.id;
      } else {
        const created = await createAuthUser(email, input.password);
        authUserId = created.id;
      }
    }

    const { data, error } = await admin.from("Usuarios").insert({
      Usuario: nombre,
      Rol: input.rol,
      metodo_login: input.metodo === "google" ? "google" : "password",
      password_hash: input.metodo === "usuario" ? input.password : null,
      totp_enrolled: input.metodo !== "usuario",
      email,
      auth_user_id: authUserId,
    }).select(COLUMNS).single();

    if (error || !data) {
      if (authUserId) await deleteAuthUser(authUserId);
      return { error: "No se pudo crear el usuario.", usuario: null };
    }
    return { error: null, usuario: mapUsuario(data, email) };
  } catch (error) {
    return { error: errorMessage(error, "No se pudo crear el usuario."), usuario: null };
  }
}

export async function adminActualizarUsuario(input: AdminUsuarioInput): Promise<{ error: string | null; usuario: AdminUsuario | null }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error, usuario: null };
    if (input.id === null) return { error: "Usuario inválido.", usuario: null };
    const invalid = validarUsuarioAdmin(input, false);
    if (invalid) return { error: invalid, usuario: null };

    const admin = createAdminClient();
    const target = await leerUsuario(admin, input.id);
    if (!target) return { error: "No encontramos ese usuario.", usuario: null };

    const objetivoSuper = target.Rol === "SuperAdmin";
    if ((objetivoSuper || input.rol === "SuperAdmin") && guard.admin.rol !== "SuperAdmin") {
      return { error: "Solo un super administrador puede gestionar ese rol.", usuario: null };
    }

    const esYo = target.id === guard.admin.id;
    const metodoActual = metodoAdminDe(target);
    const nombre = input.nombre.trim();
    const emailObjetivo = input.metodo === "usuario" ? null : normalizeEmail(input.email);
    const emailActual = target.email ? normalizeEmail(target.email) : null;

    if (esYo) {
      if (input.rol !== (target.Rol ?? "user")) return { error: "No puedes cambiar tu propio rol.", usuario: null };
      if (input.metodo !== metodoActual) return { error: "Otro administrador debe cambiar tu método de ingreso.", usuario: null };
      if (emailObjetivo !== emailActual) return { error: "Otro administrador debe cambiar tu correo.", usuario: null };
    }

    const dejaDeSerAdmin = esRolAdmin(target.Rol) && input.rol !== "admin" && input.rol !== "SuperAdmin";
    if (dejaDeSerAdmin && !(await otroAdminActivo(admin, target.id))) {
      return { error: "Debe quedar al menos un administrador activo.", usuario: null };
    }
    if (await nombreEnUso(admin, nombre, target.id)) return { error: "Ya existe un usuario con ese nombre.", usuario: null };
    if (emailObjetivo && await emailEnUso(admin, emailObjetivo, target.id)) return { error: "Ya existe un usuario con ese correo.", usuario: null };

    let authUserId = target.auth_user_id;
    let totpEnrolled = target.totp_enrolled;
    let passwordHash = target.password_hash;
    const metodoCambia = input.metodo !== metodoActual;
    const emailCambia = emailObjetivo !== emailActual;

    if (input.metodo === "usuario") {
      if (!input.password && !target.password_hash) return { error: "Escribe una contraseña para este usuario.", usuario: null };
      passwordHash = input.password || target.password_hash;
      totpEnrolled = false;
      if (target.auth_user_id) {
        await detachAuth(admin, target.id);
        authUserId = null;
        await deleteAuthUser(target.auth_user_id);
      }
    } else if (input.metodo === "google") {
      passwordHash = null;
      totpEnrolled = true;
      if (target.auth_user_id && (metodoCambia || emailCambia)) {
        await detachAuth(admin, target.id);
        authUserId = null;
        await deleteAuthUser(target.auth_user_id);
      }
    } else {
      passwordHash = null;
      totpEnrolled = true;
      const actual = authUserId ? await getAuthUserById(authUserId) : null;
      const actualSirve = Boolean(actual && actual.email && normalizeEmail(actual.email) === emailObjetivo && actual.provider === "email");
      if (metodoCambia || emailCambia || !authUserId || !actualSirve) {
        if (!actualSirve) {
          if (!input.password) return { error: "Escribe la contraseña de Auth para este usuario.", usuario: null };
          if (actual) {
            await detachAuth(admin, target.id);
            authUserId = null;
            if (!(await deleteAuthUser(actual.id))) {
              return { error: "No se pudo reemplazar la cuenta de acceso. Inténtalo de nuevo.", usuario: null };
            }
          }
          const existente = await findAuthUserByEmail(emailObjetivo || "");
          if (existente) {
            if (await authUserLinked(existente.id)) return { error: "Ese correo ya tiene una cuenta de acceso en uso.", usuario: null };
            await updateAuthUser(existente.id, { email: emailObjetivo || undefined, password: input.password });
            authUserId = existente.id;
          } else {
            const creada = await createAuthUser(emailObjetivo || "", input.password);
            authUserId = creada.id;
          }
        } else if (actual && input.password) {
          await updateAuthUser(actual.id, { password: input.password });
        }
      } else if (input.password && authUserId) {
        await updateAuthUser(authUserId, { password: input.password });
      }
    }

    const { data, error } = await admin.from("Usuarios").update({
      Usuario: nombre,
      Rol: input.rol,
      metodo_login: input.metodo === "google" ? "google" : "password",
      email: emailObjetivo,
      auth_user_id: authUserId,
      totp_enrolled: totpEnrolled,
      password_hash: passwordHash,
    }).eq("id", target.id).select(COLUMNS).single();

    if (error || !data) return { error: "No se pudo guardar el usuario.", usuario: null };
    return { error: null, usuario: mapUsuario(data, emailObjetivo) };
  } catch (error) {
    return { error: errorMessage(error, "No se pudo guardar el usuario."), usuario: null };
  }
}

export async function adminResetearAuthenticator(id: number): Promise<{ error: string | null }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error };
    const admin = createAdminClient();
    const target = await leerUsuario(admin, id);
    if (!target) return { error: "No encontramos ese usuario." };
    if (target.Rol === "SuperAdmin" && guard.admin.rol !== "SuperAdmin") {
      return { error: "Solo un super administrador puede resetear ese usuario." };
    }
    if (target.auth_user_id) await removeAuthFactors(target.auth_user_id);
    if (target.metodo_login !== "google") {
      const { error } = await admin.from("Usuarios").update({ totp_enrolled: false }).eq("id", target.id);
      if (error) return { error: "No se pudo guardar el cambio." };
    }
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "No se pudo resetear el Authenticator.") };
  }
}

export async function adminEstadoAuthenticator(id: number): Promise<{ error: string | null; estado: "activo" | "pendiente" | "sin-auth" }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error, estado: "sin-auth" };
    const admin = createAdminClient();
    const target = await leerUsuario(admin, id);
    if (!target) return { error: "No encontramos ese usuario.", estado: "sin-auth" };
    if (!target.auth_user_id) return { error: null, estado: "sin-auth" };
    const activo = await factorVerificado(target.auth_user_id);
    return { error: null, estado: activo ? "activo" : "pendiente" };
  } catch (error) {
    return { error: errorMessage(error, "No se pudo consultar el Authenticator."), estado: "sin-auth" };
  }
}

export async function adminEliminarUsuario(id: number): Promise<{ error: string | null }> {
  try {
    const guard = await requireAdmin();
    if (guard.error || !guard.admin) return { error: guard.error };
    const admin = createAdminClient();
    const target = await leerUsuario(admin, id);
    if (!target) return { error: "No encontramos ese usuario." };
    if (target.id === guard.admin.id) return { error: "No puedes eliminar tu propio usuario." };
    if (target.Rol === "SuperAdmin" && guard.admin.rol !== "SuperAdmin") {
      return { error: "Solo un super administrador puede eliminar ese usuario." };
    }
    if (esRolAdmin(target.Rol) && !(await otroAdminActivo(admin, target.id))) {
      return { error: "Debe quedar al menos un administrador activo." };
    }
    const { error } = await admin.from("Usuarios").delete().eq("id", target.id);
    if (error) return { error: "No se pudo eliminar el usuario." };
    if (target.auth_user_id) await deleteAuthUser(target.auth_user_id);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error, "No se pudo eliminar el usuario.") };
  }
}
