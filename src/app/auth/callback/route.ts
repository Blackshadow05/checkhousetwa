import { NextResponse } from "next/server";
import { fetchGoogleProfile } from "@/lib/auth/profile";
import { recordLogin } from "@/lib/auth/record-login";
import {
  clearStartedAt,
  completeSupabaseSession,
  signOutLocal,
} from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function destinationUrl(next: string | null, origin: string): URL {
  const fallback = new URL("/", origin);
  if (
    !next?.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    Array.from(next).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return fallback;
  }

  try {
    const destination = new URL(next, origin);
    return destination.origin === origin ? destination : fallback;
  } catch {
    return fallback;
  }
}

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
    if (error || !data.session) return await reject("error");

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return await reject("error");

    const profile = await fetchGoogleProfile(client, userData.user);
    if (!profile || profile.Rol === "inactivo") {
      return await reject("unauthorized");
    }

    const user = await completeSupabaseSession(profile);
    await recordLogin({
      userId: user.id,
      usuario: user.nombre,
      metodo: "google",
      accessToken: data.session.access_token,
    });

    return NextResponse.redirect(
      destinationUrl(requestUrl.searchParams.get("next"), requestUrl.origin)
    );
  } catch {
    console.error("No se pudo completar el acceso con Google.");
    return await reject("error");
  }
}
