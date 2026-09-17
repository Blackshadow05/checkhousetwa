import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
const COOKIE = "casitas-usuario";
const MAX_AGE = 6 * 24 * 60 * 60;
function sign(value: string) {
  const secret = process.env.USUARIOS_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("El acceso de usuarios aún no está configurado.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export async function setUsuarioSession(id: number) {
  const value = Buffer.from(JSON.stringify({ id, expires: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export async function clearUsuarioSession() { (await cookies()).delete(COOKIE); }
export async function getUsuarioSession() {
  try {
    const raw = (await cookies()).get(COOKIE)?.value;
    if (!raw) return null;
    const [value, signature] = raw.split(".");
    if (!value || !signature) return null;
    const expected = Buffer.from(sign(value)); const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!Number.isInteger(payload.id) || !(payload.expires > Date.now())) return null;
    const client = await createAdminClient();
    const { data, error } = await client.from("Usuarios").select("id,Usuario,Rol,metodo_login,totp_enrolled").eq("id", payload.id).single();
    if (error || !data || data.Rol === "inactivo" || data.metodo_login === "google" || data.totp_enrolled) return null;
    return { id: data.id, nombre: data.Usuario };
  } catch { return null; }
}
