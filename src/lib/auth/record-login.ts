import "server-only";

import { headers } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

type RecordLoginOptions = {
  userId: number;
  usuario: string;
  metodo: "password" | "authenticator" | "google";
  accessToken?: string;
};

export async function recordLogin({
  userId,
  usuario,
  metodo,
  accessToken,
}: RecordLoginOptions): Promise<void> {
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const incomingHeaders = await headers();
    const userAgent = incomingHeaders.get("user-agent") ?? "";
    const requestHeaders = new Headers({
      "content-type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken || publishableKey}`,
    });

    for (const name of ["x-forwarded-for", "user-agent"]) {
      const value = incomingHeaders.get(name);
      if (value !== null) requestHeaders.set(name, value);
    }

    const response = await fetch(
      `${url.replace(/\/+$/, "")}/functions/v1/record-login`,
      {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ userId, usuario, metodo, userAgent }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      console.error("No se pudo registrar el acceso:", response.status);
    }
  } catch {
    console.error("No se pudo registrar el acceso.");
  }
}
