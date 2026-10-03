"use server";

import { getSesionUsuario } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { esRolAdmin } from "@/lib/usuarios-admin";
import { LOGIN_LOGS_PAGE_SIZE, validLoginLogsCursor, type LoginLogsCursor, type LoginLogsResult } from "@/lib/login-logs";

export async function fetchLoginLogs(cursor: LoginLogsCursor | null = null): Promise<LoginLogsResult> {
  try {
    const user = await getSesionUsuario();
    if (!user || !esRolAdmin(user.rol)) {
      return { snapshot: null, denied: true, error: user ? "Solo los administradores pueden consultar los accesos." : "Inicia sesión para consultar los accesos." };
    }
    if (cursor !== null && !validLoginLogsCursor(cursor)) {
      return { snapshot: null, error: "No se pudieron cargar los accesos anteriores. Actualiza el historial." };
    }

    // Signed app sessions use the private client. Recheck the stored role on every read;
    // Supabase Auth clients are independently restricted by the table's SELECT policy.
    let query = createAdminClient().from("login_logs")
      .select("id,usuario,ip_address,metodo,logged_at")
      .order("logged_at", { ascending: false }).order("id", { ascending: false })
      .limit(LOGIN_LOGS_PAGE_SIZE + 1);
    if (cursor) query = query.or(`logged_at.lt.${cursor.loggedAt},and(logged_at.eq.${cursor.loggedAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error || !data) throw new Error("login-logs-read");
    const rows = data.slice(0, LOGIN_LOGS_PAGE_SIZE);
    const last = rows.at(-1);
    return {
      error: null,
      snapshot: {
        ownerId: user.id,
        rows,
        updatedAt: new Date().toISOString(),
        nextCursor: data.length > LOGIN_LOGS_PAGE_SIZE && last ? { loggedAt: last.logged_at, id: last.id } : null,
      },
    };
  } catch {
    return { snapshot: null, error: "No se pudo actualizar el historial. Inténtalo de nuevo." };
  }
}
