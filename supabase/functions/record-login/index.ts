import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'
import {
  isGoogleAuthUser,
  LOGIN_METHODS,
  PROFILE_COLUMNS,
  type UsuarioRecord,
} from '../_shared/auth-rules.ts'
import {
  getBearerToken,
  getClientIp,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  resolveServiceKey,
  resolveSupabaseUrl,
  truncate,
} from '../_shared/http.ts'
import { recordLoginEvent, type LoginMetodo } from '../_shared/login-log.ts'

const VALID_METHODS = new Set<string>(Object.values(LOGIN_METHODS))

const methodAllowedForProfile = (
  metodo: string,
  profile: UsuarioRecord,
  authUser: { app_metadata?: Record<string, unknown> | null; identities?: { provider?: string }[] | null } | null | undefined,
): boolean => {
  if (metodo === LOGIN_METHODS.password) {
    return profile.metodo_login !== LOGIN_METHODS.google && !profile.totp_enrolled
  }

  if (metodo === LOGIN_METHODS.authenticator) {
    return Boolean(profile.totp_enrolled)
  }

  if (metodo === LOGIN_METHODS.google) {
    return isGoogleAuthUser(authUser)
  }

  return false
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return preflightResponse()
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido.' }, 405)
  }

  const supabaseUrl = resolveSupabaseUrl()
  const serviceKey = resolveServiceKey()

  if (!supabaseUrl || !serviceKey) {
    console.error('record-login: falta configuración de Supabase.')
    return jsonResponse({ ok: false, error: 'La función no está configurada.' }, 500)
  }

  const jwt = getBearerToken(request)
  if (!jwt) {
    return jsonResponse({ ok: false, error: 'Sesión no válida o expirada.' }, 401)
  }

  const body = await readJsonBody(request)
  if (!body) {
    return jsonResponse({ ok: false, error: 'Solicitud inválida.' }, 400)
  }

  const metodo = String(body.metodo || '').trim()
  if (!VALID_METHODS.has(metodo)) {
    return jsonResponse({ ok: false, error: 'El método de acceso no es válido.' }, 400)
  }

  try {
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    const authUser = authData?.user

    if (authError || !authUser?.id) {
      return jsonResponse({ ok: false, error: 'Sesión no válida o expirada.' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: profile, error: profileError } = await admin
      .from('Usuarios')
      .select(PROFILE_COLUMNS)
      .eq('auth_user_id', authUser.id)
      .maybeSingle<UsuarioRecord>()

    if (profileError) {
      console.error('record-login: error consultando Usuarios:', profileError.message)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (!profile) {
      return jsonResponse({ ok: false, error: 'No se encontró ese usuario.' }, 404)
    }

    if (!methodAllowedForProfile(metodo, profile, authUser)) {
      return jsonResponse({ ok: false, error: 'La sesión no coincide con este usuario.' }, 403)
    }

    const result = await recordLoginEvent(admin, profile, {
      metodo: metodo as LoginMetodo,
      ipAddress: getClientIp(request),
      userAgent: truncate(body.userAgent || request.headers.get('user-agent')),
    })

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error || 'No se pudo registrar el acceso.' }, 400)
    }

    return jsonResponse({
      ok: true,
      ip_address: result.ipAddress,
      logged_at: result.loggedAt,
      duplicated: result.duplicated,
    })
  } catch (error) {
    console.error('record-login error:', error)
    return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
  }
})
