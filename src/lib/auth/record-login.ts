import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/server";

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

    if (!accessToken) {
      const ipAddress = incomingHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      after(async () => {
        try {
          const admin = createAdminClient();
          const loggedAt = new Date().toISOString();
          const { error } = await admin.from("login_logs").insert({
            user_id: userId,
            usuario,
            ip_address: ipAddress,
            user_agent: userAgent.slice(0, 512) || null,
            metodo,
            logged_at: loggedAt,
          });
          if (error) throw error;
          const { error: updateError } = await admin
            .from("Usuarios")
            .update({ ultimo_login_at: loggedAt, ultimo_login_ip: ipAddress })
            .eq("id", userId);
          if (updateError) throw updateError;
        } catch {
          console.error("No se pudo registrar el acceso.");
        }
      });
      return;
    }

    const requestHeaders = new Headers({
      "content-type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    });

    for (const name of ["x-forwarded-for", "user-agent"]) {
      const value = incomingHeaders.get(name);
      if (value !== null) requestHeaders.set(name, value);
    }

    // Capture request metadata now; Next keeps this task alive after sending
    // the login response, including on serverless hosts. Do not await the HTTP
    // request in the login path or start an untracked fire-and-forget promise.
    after(async () => {
      try {
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
    });
  } catch {
    console.error("No se pudo registrar el acceso.");
  }
}
