export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

export const preflightResponse = (): Response => new Response('ok', { headers: corsHeaders })

export const resolveSupabaseUrl = (): string => Deno.env.get('SUPABASE_URL') || ''

export const resolveServiceKey = (): string =>
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_KEY') ||
  ''

export const getBearerToken = (request: Request): string => {
  const header = request.headers.get('Authorization') || request.headers.get('authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

const firstForwardedIp = (value: string | null): string | null => {
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first || null
}

export const getClientIp = (request: Request): string | null =>
  firstForwardedIp(request.headers.get('x-forwarded-for')) ||
  request.headers.get('cf-connecting-ip') ||
  request.headers.get('x-real-ip') ||
  request.headers.get('x-client-ip') ||
  null

export const truncate = (value: unknown, max = 512): string | null => {
  const text = String(value ?? '').trim()
  if (!text) return null
  return text.slice(0, max)
}

export const backgroundTask = (promise: Promise<unknown>): void => {
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (task: Promise<unknown>) => void }
  }).EdgeRuntime

  if (runtime?.waitUntil) {
    runtime.waitUntil(promise)
    return
  }

  promise.catch(() => null)
}

export const readJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}
