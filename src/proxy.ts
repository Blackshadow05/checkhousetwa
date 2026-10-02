import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/update-session";

const MOBILE_USER_AGENT = /Android|iPhone|iPod/i;

const BLOCKED_PAGE = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Casitas</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f4;--fg:#1c2420;--muted:#5d6862}
@media (prefers-color-scheme:dark){:root{--bg:#131b18;--fg:#eef1ee;--muted:#a3ada7}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{max-width:340px;padding:24px}
img{width:96px;height:96px}
h1{font-size:1.25rem;margin:16px 0 8px}
p{color:var(--muted);line-height:1.5;margin:0}
</style>
</head>
<body>
<main>
<img src="/icons/icon-192.png" alt="">
<h1>Disponible solo en la app móvil</h1>
<p>Casitas se usa desde la app instalada en tu teléfono Android o iPhone.</p>
</main>
</body>
</html>`;

function isMobileRequest(request: NextRequest) {
  if (request.headers.get("sec-ch-ua-mobile") === "?0") return false;
  return MOBILE_USER_AGENT.test(request.headers.get("user-agent") ?? "");
}

export async function proxy(request: NextRequest) {
  if (
    process.env.VERCEL_ENV === "production" &&
    !request.nextUrl.pathname.startsWith("/.well-known/") &&
    !isMobileRequest(request)
  ) {
    return new Response(BLOCKED_PAGE, {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        Vary: "User-Agent, Sec-CH-UA-Mobile",
      },
    });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|articulos/|sw.js|swe-worker|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
