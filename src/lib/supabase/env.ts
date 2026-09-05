import "server-only";

export function getSupabaseEnv() {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "No uses variables NEXT_PUBLIC_ para Supabase. Las claves deben quedar solo en el servidor."
    );
  }

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY");
  }

  if (
    publishableKey.includes("service_role") ||
    publishableKey.startsWith("sb_secret_") ||
    publishableKey.startsWith("eyJ")
  ) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY no puede ser anon JWT, service_role ni secret."
    );
  }

  return { url, publishableKey };
}
