import "server-only";

import { countRevisionesCasitas } from "@/lib/db/revisiones-casitas";
import { createPrivateClient } from "@/lib/auth/session";

export async function getRemoteRevisionesCount() {
  const supabase = await createPrivateClient();
  const { count, error } = await countRevisionesCasitas(supabase);

  return {
    remoteCount: count ?? 0,
    error: error?.message ?? null,
  };
}
