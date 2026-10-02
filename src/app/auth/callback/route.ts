import { NextResponse } from "next/server";
import { fetchGoogleProfile, linkAuthUserToProfile } from "@/lib/auth/profile";
import { clearStartedAt, signOutLocal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { clearUsuarioSession } from "@/lib/usuarios-session";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  let client: Awaited<ReturnType<typeof createClient>> | null = null;

  async function reject(reason: "error" | "unauthorized") {
    if (client) await signOutLocal(client);
    try {
      await clearStartedAt();
    } catch {
      console.error("No se pudo limpiar la sesión de Google.");
    }
    return NextResponse.redirect(new URL(`/?auth=${reason}`, requestUrl.origin));
  }

  try {
    client = await createClient();
    const code = requestUrl.searchParams.get("code");
    if (!code || requestUrl.searchParams.has("error")) {
      return await reject("error");
    }

    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) return await reject("error");

    const profile = await fetchGoogleProfile(client, data.user);
    if (!profile || profile.Rol === "inactivo") {
      return await reject("unauthorized");
    }

    await linkAuthUserToProfile(client, profile, data.user);
    await clearUsuarioSession();
    await clearStartedAt();

    return NextResponse.redirect(new URL("/?auth=authenticator", requestUrl.origin));
  } catch {
    console.error("No se pudo completar el acceso con Google.");
    return await reject("error");
  }
}
