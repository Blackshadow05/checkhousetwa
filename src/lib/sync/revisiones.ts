import "server-only";

import { countRevisionesCasitas } from "@/lib/db/revisiones-casitas";
import { createClient } from "@/lib/supabase/server";

export async function getRemoteRevisionesCount() {
  const supabase = await createClient();
  const { count, error } = await countRevisionesCasitas(supabase);

  return {
    remoteCount: count ?? 0,
    error: error?.message ?? null,
  };
}
