import { NextResponse } from "next/server";
import { clearStartedAt } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  try {
    const client = await createClient();
    await clearStartedAt();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${requestUrl.origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));
    }
    return NextResponse.redirect(data.url);
  } catch {
    console.error("No se pudo abrir Google.");
    return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));
  }
}
