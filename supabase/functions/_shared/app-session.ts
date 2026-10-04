import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'

export const sesionAppValida = async (supabaseUrl: string, jwt: string): Promise<boolean> => {
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!supabaseUrl || !apiKey || !jwt || jwt.split('.').length !== 3) return false

  try {
    const client = createClient(supabaseUrl, apiKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.rpc('sesion_app_valida')
    return !error && data === true
  } catch {
    return false
  }
}
