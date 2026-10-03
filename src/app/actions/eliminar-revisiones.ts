"use server";

import { isIP } from "node:net";
import { headers } from "next/headers";
import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { DELETE_BATCH_SIZE, DELETE_PAGE_SIZE, isUuid, validDeleteCursor, validDeleteIds, type DeleteHistoryCursor, type DeletePage, type DeleteResult, type RegistroEliminado, type RevisionDeleteCursor, type RevisionParaEliminar } from "@/lib/eliminar-revisiones";

const DENIED = "Solo los usuarios SuperAdmin pueden acceder a esta opción.";
const emptyPage = <T, C>(error: string, denied = false): DeletePage<T, C> => ({ rows: [], nextCursor: null, updatedAt: "", error, denied });

export async function fetchRevisionesParaEliminar(cursor: RevisionDeleteCursor | null = null, latestBatch = false): Promise<DeletePage<RevisionParaEliminar, RevisionDeleteCursor>> {
  try {
    const actor = await getSesionUsuario();
    if (actor?.rol !== "SuperAdmin") return emptyPage(DENIED, true);
    if ((cursor !== null && !validDeleteCursor(cursor)) || typeof latestBatch !== "boolean" || (latestBatch && cursor !== null)) return emptyPage("La página solicitada no es válida.");
    const limit = latestBatch ? DELETE_BATCH_SIZE : DELETE_PAGE_SIZE;
    let query = createAdminClient().from("revisiones_casitas")
      .select("id,casita,quien_revisa,caja_fuerte,created_at")
      .order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(limit + 1);
    if (cursor) query = cursor.fecha === null
      ? query.is("created_at", null).lt("id", cursor.id)
      : query.or(`created_at.lt.${cursor.fecha},and(created_at.eq.${cursor.fecha},id.lt.${cursor.id}),created_at.is.null`);
    const { data, error } = await query;
    if (error || !data) return emptyPage("No se pudieron cargar las revisiones. Inténtalo de nuevo.");
    const rows = data.slice(0, limit); const last = rows.at(-1);
    return { rows, nextCursor: data.length > limit && last ? { id: last.id, fecha: last.created_at } : null, updatedAt: new Date().toISOString(), error: null };
  } catch { return emptyPage("No se pudieron cargar las revisiones. Conservamos lo ya cargado."); }
}

export async function fetchRegistrosEliminados(cursor: DeleteHistoryCursor | null = null): Promise<DeletePage<RegistroEliminado, DeleteHistoryCursor>> {
  try {
    const actor = await getSesionUsuario();
    if (actor?.rol !== "SuperAdmin") return emptyPage(DENIED, true);
    if (cursor !== null && !validDeleteCursor(cursor, false)) return emptyPage("La página solicitada no es válida.");
    let query = createAdminClient().from("registros_eliminados").select("id,fecha,usuario_id,usuario,ip,cantidad")
      .order("fecha", { ascending: false }).order("id", { ascending: false }).limit(DELETE_PAGE_SIZE + 1);
    if (cursor) query = query.or(`fecha.lt.${cursor.fecha},and(fecha.eq.${cursor.fecha},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error || !data) return emptyPage("No se pudo actualizar el historial de eliminaciones.");
    const rows = data.slice(0, DELETE_PAGE_SIZE); const last = rows.at(-1);
    return { rows, nextCursor: data.length > DELETE_PAGE_SIZE && last ? { id: last.id, fecha: last.fecha } : null, updatedAt: new Date().toISOString(), error: null };
  } catch { return emptyPage("No se pudo actualizar el historial. Conservamos lo ya cargado."); }
}

export async function eliminarRevisiones(ids: string[], codigo: string): Promise<DeleteResult> {
  try {
    const actor = await getSesionUsuario();
    if (actor?.rol !== "SuperAdmin") return { error: DENIED, registro: null, denied: true };
    if (!validDeleteIds(ids)) return { error: "Selecciona entre 1 y 200 revisiones distintas.", registro: null };
    if (typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) return { error: "Escribe el código de 6 dígitos de Authenticator.", registro: null };

    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { error: "Inicia sesión con Authenticator para eliminar revisiones.", registro: null };
    // Bind the actual authenticated account to the current app user, not a client-supplied ID.
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from("Usuarios").select("id,Rol,auth_user_id").eq("id", actor.id).single();
    if (profileError || profile?.Rol !== "SuperAdmin" || profile.auth_user_id !== auth.user.id) return { error: DENIED, registro: null, denied: true };
    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    const factor = factors?.totp.find(f => f.status === "verified");
    if (factorsError || !factor) return { error: "Configura Authenticator en tu cuenta antes de eliminar revisiones.", registro: null };

    // Always create and verify a fresh challenge, even when the session is already AAL2.
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) return { error: "No se pudo iniciar la verificación. Inténtalo de nuevo.", registro: null };
    const verify = await client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: codigo });
    if (verify.error || verify.data?.user?.id !== auth.user.id) return { error: "Código incorrecto o vencido. Espera un código nuevo e inténtalo de nuevo.", registro: null };
    // This token comes directly from the verified Auth response, never request input.
    const claims = JSON.parse(Buffer.from(verify.data.access_token.split(".")[1], "base64url").toString()) as { session_id?: unknown; aal?: unknown };
    if (!isUuid(claims.session_id) || claims.aal !== "aal2") return { error: "No se pudo verificar la sesión. Vuelve a iniciar sesión.", registro: null };
    const requestHeaders = await headers();
    // Vercel supplies the connecting client's IP. Outside that trusted proxy,
    // leave it unavailable instead of recording a spoofable client header.
    const ipCandidate = process.env.VERCEL === "1" ? requestHeaders.get("x-vercel-forwarded-for")?.trim() : null;
    const ip = ipCandidate && isIP(ipCandidate) ? ipCandidate : null;
    const { data, error } = await admin.rpc("eliminar_revisiones_superadmin", {
      p_actor_id: actor.id, p_auth_user_id: auth.user.id, p_session_id: claims.session_id,
      p_challenge_id: challenge.data.id, p_ids: ids, p_ip: ip,
    });
    if (error || !data?.[0]) {
      if (error?.code === "P0002") return { error: "Algunas revisiones ya no existen. Actualiza la lista y revisa la selección.", registro: null };
      if (error?.code === "42501") return { error: "La autorización ya no es válida. Vuelve a iniciar sesión.", registro: null };
      return { error: "No se pudo confirmar la eliminación. Actualiza el historial antes de reintentar.", registro: null };
    }
    return { error: null, registro: data[0] };
  } catch { return { error: "No se pudo confirmar la eliminación. Actualiza el historial antes de reintentar.", registro: null }; }
}
