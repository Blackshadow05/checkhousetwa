"use server";
import { createClient } from "@/lib/supabase/server";
import { clearUsuarioSession, getUsuarioSession, setUsuarioSession } from "@/lib/usuarios-session";
export async function currentUsuario() { return getUsuarioSession(); }
export async function logoutUsuario() { await clearUsuarioSession(); }
export async function loginUsuario(username: string, password: string) {
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 100 || password.length > 256) return { error: "Ingresa tu usuario y contraseña.", user: null };
  try {
    const client = await createClient();
    // Matches the existing Usuarios login. Credentials and database hashes never leave the server.
    const { data, error } = await client.from("Usuarios").select("id,Usuario,Rol,metodo_login,totp_enrolled").eq("Usuario", username.trim()).eq("password_hash", password).single();
    if (error || !data || data.Rol === "inactivo") return { error: "Usuario o contraseña incorrectos.", user: null };
    if (data.metodo_login === "google" || data.totp_enrolled) return { error: "Esta cuenta requiere Google o Authenticator. Ese acceso todavía no está disponible en esta versión.", user: null };
    await setUsuarioSession(data.id);
    return { error: null, user: { id: data.id, nombre: data.Usuario } };
  } catch { return { error: "No se pudo iniciar sesión. Revisa tu conexión o la configuración de acceso.", user: null }; }
}
