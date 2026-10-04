import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type BrowserConfig = { url: string; publishableKey: string };

let client: SupabaseClient<Database> | null = null;
let loading: Promise<SupabaseClient<Database>> | null = null;

async function loadConfig(): Promise<BrowserConfig> {
  const response = await fetch("/api/supabase/browser", { cache: "no-store" });
  if (!response.ok) throw new Error("supabase-browser");
  const config = (await response.json()) as Partial<BrowserConfig>;
  if (!config.url || !config.publishableKey) throw new Error("supabase-browser");
  return { url: config.url, publishableKey: config.publishableKey };
}

export function getBrowserSupabase() {
  if (client) return Promise.resolve(client);
  if (!loading) {
    loading = loadConfig().then(({ url, publishableKey }) => {
      client = createClient<Database>(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return client;
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
