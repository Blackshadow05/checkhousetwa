import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'
import {
  buildShadowEmail,
  evaluateAuthenticatorPendingAccess,
  evaluateProfileAccess,
  evaluateTotpFactorAccess,
  isAlreadyRegisteredError,
  isGoogleAuthUser,
  toClientProfile,
  validateCredentialsInput,
  type AccessDecision,
  type UsuarioRecord,
} from '../_shared/auth-rules.ts'
import {
  backgroundTask,
  getClientIp,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  resolveServiceKey,
  resolveSupabaseUrl,
  truncate,
} from '../_shared/http.ts'
import { recordLoginEvent } from '../_shared/login-log.ts'

const statusForDecision = (decision: AccessDecision): number => {
  if (decision.code === 'invalid_credentials') return 401
  if (decision.code === 'inactive') return 403
  if (decision.code === 'google_required') return 403
  if (decision.code === 'authenticator_required') return 403
  if (decision.code === 'authenticator_pending') return 403
  return 400
}

const decisionBody = (decision: AccessDecision): Record<string, unknown> => ({
  ok: false,
  error: decision.message,
  code: decision.code,
  useGoogle: decision.useGoogle,
  useAuthenticator: decision.useAuthenticator,
})

const deriveAuthPassword = async (serviceKey: string, profileId: number): Promise<string> => {
  const secret = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    secret,
    new TextEncoder().encode(`casitas-auth:${profileId}`),
  )

  const hex = Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')

  return `Cs!${hex.slice(0, 44)}`
}

const listAuthFactors = async (supabaseUrl: string, serviceKey: string, userId: string): Promise<unknown[]> => {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}/factors`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    })

    if (!response.ok) return []

    const payload = await response.json().catch(() => null)
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.factors)) return payload.factors
    if (Array.isArray(payload?.totp)) return payload.totp
    return []
  } catch {
    return []
  }
}

const hasVerifiedTotpFactor = async (supabaseUrl: string, serviceKey: string, userId: string): Promise<boolean> => {
  const factors = await listAuthFactors(supabaseUrl, serviceKey, userId)
  return factors.some((factor) => {
    if (!factor || typeof factor !== 'object') return false
    const candidate = factor as Record<string, unknown>
    return candidate.status === 'verified' && (!candidate.factor_type || candidate.factor_type === 'totp')
  })
}

interface ResolvedAuthUser {
  ok: boolean
  usesAuthPassword: boolean
  id: string
  email: string
  error?: string
}

const resolveAuthUser = async (
  admin: SupabaseClient,
  profile: UsuarioRecord,
  derivedPassword: string,
): Promise<ResolvedAuthUser> => {
  if (profile.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(profile.auth_user_id)

    if (!error && data?.user?.id) {
      const existing = data.user
      const isShadowAccount = existing.app_metadata?.auth_source === 'password'

      if (isShadowAccount) {
        return {
          ok: true,
          usesAuthPassword: true,
          id: existing.id,
          email: existing.email || buildShadowEmail(profile),
        }
      }

      if (!isGoogleAuthUser(existing)) {
        return {
          ok: true,
          usesAuthPassword: false,
          id: existing.id,
          email: existing.email || '',
        }
      }
    }
  }

  const email = buildShadowEmail(profile)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: derivedPassword,
    email_confirm: true,
    user_metadata: {
      Usuario: profile.Usuario,
      Rol: profile.Rol,
    },
    app_metadata: {
      auth_source: 'password',
    },
  })

  if (!createError && created?.user?.id) {
    return { ok: true, usesAuthPassword: true, id: created.user.id, email }
  }

  if (isAlreadyRegisteredError(createError)) {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (!listError) {
      const found = (listData?.users || []).find(
        (user) => (user.email || '').toLowerCase() === email.toLowerCase(),
      )

      if (found?.id) {
        const { error: updateError } = await admin.auth.admin.updateUserById(found.id, {
          password: derivedPassword,
          email_confirm: true,
          app_metadata: { auth_source: 'password' },
        })

        if (updateError) {
          return { ok: false, usesAuthPassword: true, id: found.id, email, error: updateError.message }
        }

        return { ok: true, usesAuthPassword: true, id: found.id, email: found.email || email }
      }
    }
  }

  return {
    ok: false,
    usesAuthPassword: true,
    id: '',
    email,
    error: createError?.message || 'No se pudo preparar la cuenta de acceso.',
  }
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
    console.error('auth-login: falta configuración de Supabase.')
    return jsonResponse({ ok: false, error: 'El servicio de acceso no está configurado.' }, 500)
  }

  const body = await readJsonBody(request)
  if (!body) {
    return jsonResponse({ ok: false, error: 'Solicitud inválida.' }, 400)
  }

  const credentials = validateCredentialsInput(body.usuario, body.password)
  if (!credentials.allowed) {
    return jsonResponse(decisionBody(credentials), 401)
  }

  const ipAddress = request.headers.get('cf-connecting-ip') || getClientIp(request)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data: verificacion, error: verificacionError } = await admin.rpc('verificar_credenciales_usuario', {
      p_usuario: credentials.usuario,
      p_password: credentials.password,
      p_ip: ipAddress,
    })

    if (verificacionError) {
      console.error('auth-login: error verificando credenciales:', verificacionError.message)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (verificacion?.estado === 'bloqueado') {
      return jsonResponse(
        { ok: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
        429,
      )
    }

    const profile = verificacion?.estado === 'ok' ? (verificacion.perfil as UsuarioRecord) : null
    const access = evaluateProfileAccess(profile)
    if (!access.allowed) {
      return jsonResponse(decisionBody(access), statusForDecision(access))
    }

    const usuario = profile as UsuarioRecord
    const authPassword = await deriveAuthPassword(serviceKey, usuario.id)

    const authUser = await resolveAuthUser(admin, usuario, authPassword)
    if (!authUser.ok) {
      console.error('auth-login: no se pudo resolver la cuenta de Auth:', authUser.error)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (!authUser.usesAuthPassword) {
      const pendingAccess = evaluateAuthenticatorPendingAccess()
      return jsonResponse(decisionBody(pendingAccess), statusForDecision(pendingAccess))
    }

    const factorAccess = evaluateTotpFactorAccess(
      await hasVerifiedTotpFactor(supabaseUrl, serviceKey, authUser.id),
    )
    if (!factorAccess.allowed) {
      return jsonResponse(decisionBody(factorAccess), statusForDecision(factorAccess))
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(authUser.id, {
      password: authPassword,
    })

    if (passwordError) {
      console.error('auth-login: no se pudo preparar la credencial de Auth:', passwordError.message)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (usuario.auth_user_id !== authUser.id) {
      const { error: linkError } = await admin
        .from('Usuarios')
        .update({ auth_user_id: authUser.id })
        .eq('id', usuario.id)

      if (linkError) {
        console.error('auth-login: no se pudo vincular auth_user_id:', linkError.message)
        return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
      }
    }

    backgroundTask(
      recordLoginEvent(admin, usuario, {
        metodo: 'password',
        ipAddress,
        userAgent: truncate(request.headers.get('user-agent')),
      }),
    )

    return jsonResponse({
      ok: true,
      profile: toClientProfile(usuario),
      authUser: {
        email: authUser.email,
        password: authPassword,
      },
    })
  } catch (error) {
    console.error('auth-login error:', error)
    return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
  }
})
