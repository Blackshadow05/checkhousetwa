import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import type { SesionUsuario } from "@/types/database";
import { nuevoPayloadUsuario, payloadUsuarioVigente, USUARIO_SESSION_MAX_AGE } from "@/lib/usuarios-session-tiempo";
const COOKIE = "casitas-usuario";
const MAX_AGE = USUARIO_SESSION_MAX_AGE;
function sign(value: string) {
  const secret = process.env.USUARIOS_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("El acceso de usuarios aún no está configurado.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export async function setUsuarioSession(id: number) {
  const value = Buffer.from(JSON.stringify(nuevoPayloadUsuario(id))).toString("base64url");
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export async function clearUsuarioSession() { (await cookies()).delete(COOKIE); }
export async function getUsuarioSession(): Promise<SesionUsuario | null> {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw) return null;
    const [value, signature] = raw.split(".");
    if (!value || !signature) return null;
    const expected = Buffer.from(sign(value)); const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!payloadUsuarioVigente(payload)) return null;
    const client = await createAdminClient();
    const { data, error } = await client.from("Usuarios").select("id,Usuario,Rol,metodo_login,totp_enrolled").eq("id", payload.id).single();
    if (error || !data || data.Rol === "inactivo" || data.metodo_login === "google" || data.totp_enrolled) return null;
    return { id: data.id, nombre: data.Usuario, rol: data.Rol };
  } catch { return null; }
}
