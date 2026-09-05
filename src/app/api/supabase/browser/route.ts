import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET() {
  const { url, publishableKey } = getSupabaseEnv();
  return NextResponse.json(
    { url, publishableKey },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
