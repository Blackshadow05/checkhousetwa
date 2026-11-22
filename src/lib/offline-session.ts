import { idbGet, idbPut, IDB_STORES } from "@/lib/idb/database";
import { USUARIO_SESSION_HOURS } from "@/lib/usuarios-session-tiempo";
import type { UsuarioShell } from "@/types/database";

const OFFLINE_SESSION_KEY = "offline-session-v1";
export const OFFLINE_SESSION_MAX_AGE_MS = USUARIO_SESSION_HOURS * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type OfflineSessionSnapshot = {
  user: UsuarioShell;
  savedAt: number;
  expiresAt: number;
};

type StoredOfflineSession = {
  id: typeof OFFLINE_SESSION_KEY;
  session: OfflineSessionSnapshot | null;
};

export function buildOfflineSession(user: UsuarioShell, now = Date.now()): OfflineSessionSnapshot {
  return {
    user: {
      id: user.id,
      nombre: user.nombre,
      ...(user.rol !== undefined ? { rol: user.rol } : {}),
    },
    savedAt: now,
    expiresAt: now + OFFLINE_SESSION_MAX_AGE_MS,
  };
}

export function isOfflineSessionValid(
  snapshot: unknown,
  now = Date.now(),
): snapshot is OfflineSessionSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const { user, savedAt, expiresAt } = snapshot as Partial<OfflineSessionSnapshot>;
  if (!user || typeof user !== "object") return false;
  if (typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0) return false;
  if (typeof user.nombre !== "string" || !user.nombre.trim()) return false;
  if (user.rol !== undefined && user.rol !== null && typeof user.rol !== "string") return false;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return false;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return false;
  if (savedAt > now + CLOCK_SKEW_MS) return false;
  if (expiresAt > savedAt + OFFLINE_SESSION_MAX_AGE_MS) return false;
  return now < expiresAt;
}

export async function saveOfflineSession(user: UsuarioShell): Promise<void> {
  try {
    await idbPut<StoredOfflineSession>(IDB_STORES.snapshots, {
      id: OFFLINE_SESSION_KEY,
      session: buildOfflineSession(user),
    });
  } catch {
    // Best-effort local cache; ignore storage errors.
  }
}

export async function clearOfflineSession(): Promise<void> {
  try {
    await idbPut<StoredOfflineSession>(IDB_STORES.snapshots, {
      id: OFFLINE_SESSION_KEY,
      session: null,
    });
  } catch {
    // Best-effort local cache cleanup.
  }
}

export async function loadOfflineSession(now = Date.now()): Promise<UsuarioShell | null> {
  try {
    const stored = await idbGet<StoredOfflineSession>(IDB_STORES.snapshots, OFFLINE_SESSION_KEY);
    if (!stored?.session) return null;
    if (!isOfflineSessionValid(stored.session, now)) {
      void clearOfflineSession();
      return null;
    }
    return stored.session.user;
  } catch {
    return null;
  }
}
