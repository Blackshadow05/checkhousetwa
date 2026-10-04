export const LOGIN_METHODS = {
  password: 'password',
  google: 'google',
  authenticator: 'authenticator'
} as const

export const USER_MANAGERS = ['Esteban B', 'JosephR', 'Ramiro Q']

export const PROFILE_COLUMNS = 'id, Usuario, Rol, metodo_login, email, auth_user_id, totp_enrolled'

export const MAX_USUARIO_LENGTH = 160
export const MAX_PASSWORD_LENGTH = 512

export interface UsuarioRecord {
  id: number
  Usuario: string
  Rol: string | null
  metodo_login: string | null
  email: string | null
  auth_user_id: string | null
  totp_enrolled: boolean | null
}

export interface ClientProfile {
  id: number
  Usuario: string
  Rol: string | null
  metodo_login: string
  email: string | null
  auth_user_id: string | null
  totp_enrolled: boolean
}

export type AccessCode =
  | 'ok'
  | 'invalid_credentials'
  | 'inactive'
  | 'google_required'
  | 'authenticator_required'
  | 'authenticator_pending'

export interface AccessDecision {
  allowed: boolean
  code: AccessCode
  message: string
  useGoogle: boolean
  useAuthenticator: boolean
}

const allow = (): AccessDecision => ({
  allowed: true,
  code: 'ok',
  message: '',
  useGoogle: false,
  useAuthenticator: false,
})

const deny = (code: AccessCode, message: string): AccessDecision => ({
  allowed: false,
  code,
  message,
  useGoogle: code === 'google_required',
  useAuthenticator: code === 'authenticator_required' || code === 'authenticator_pending',
})

export const isGoogleAuthUser = (authUser: {
  app_metadata?: Record<string, unknown> | null
  identities?: { provider?: string }[] | null
} | null | undefined): boolean => {
  if (!authUser) return false
  if (authUser.app_metadata?.provider === 'google') return true
  return (authUser.identities || []).some((identity) => identity?.provider === 'google')
}

export const normalizeUsuario = (value: unknown): string => String(value ?? '').trim()

export const normalizeEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase()

export const validateCredentialsInput = (
  usuario: unknown,
  password: unknown,
): AccessDecision & { usuario: string; password: string } => {
  const normalizedUsuario = normalizeUsuario(usuario)
  const rawPassword = typeof password === 'string' ? password : ''

  if (!normalizedUsuario || !rawPassword) {
    return {
      ...deny('invalid_credentials', 'Usuario o contraseña incorrectos'),
      usuario: normalizedUsuario,
      password: rawPassword,
    }
  }

  if (normalizedUsuario.length > MAX_USUARIO_LENGTH || rawPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      ...deny('invalid_credentials', 'Usuario o contraseña incorrectos'),
      usuario: normalizedUsuario,
      password: rawPassword,
    }
  }

  return { ...allow(), usuario: normalizedUsuario, password: rawPassword }
}

export const evaluateProfileAccess = (profile: UsuarioRecord | null | undefined): AccessDecision => {
  if (!profile) {
    return deny('invalid_credentials', 'Usuario o contraseña incorrectos')
  }

  if (profile.Rol === 'inactivo') {
    return deny('inactive', 'Usuario inactivo. Contacte al administrador.')
  }

  if (profile.metodo_login === LOGIN_METHODS.google) {
    return deny('google_required', 'Este usuario entra con Google. Usa el botón de Google.')
  }

  if (profile.totp_enrolled) {
    return deny(
      'authenticator_required',
      'Tu cuenta ya usa Google Authenticator. Entra con el botón Authenticator.',
    )
  }

  return allow()
}

export const evaluateTotpFactorAccess = (hasVerifiedTotp: boolean): AccessDecision => {
  if (hasVerifiedTotp) {
    return deny(
      'authenticator_required',
      'Tu cuenta ya usa Google Authenticator. Entra con el botón Authenticator.',
    )
  }

  return allow()
}

export const evaluateAuthenticatorPendingAccess = (): AccessDecision =>
  deny(
    'authenticator_pending',
    'Tu cuenta está pendiente de activar Google Authenticator. Entra con el botón Authenticator.',
  )

export const toClientProfile = (profile: UsuarioRecord): ClientProfile => ({
  id: profile.id,
  Usuario: profile.Usuario,
  Rol: profile.Rol,
  metodo_login: profile.metodo_login || LOGIN_METHODS.password,
  email: profile.email || null,
  auth_user_id: profile.auth_user_id || null,
  totp_enrolled: Boolean(profile.totp_enrolled),
})

export const isUserManager = (profile: Pick<UsuarioRecord, 'Usuario' | 'Rol'> | null | undefined): boolean => {
  if (!profile) return false
  return USER_MANAGERS.includes(profile.Usuario) && profile.Rol !== 'inactivo'
}

export const buildShadowEmail = (profile: Pick<UsuarioRecord, 'id' | 'Usuario'>): string => {
  const slug = String(profile.Usuario || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug
    ? `usuario-${profile.id}-${slug}@casitas.local`
    : `usuario-${profile.id}@casitas.local`
}

export const isAlreadyRegisteredError = (error: { message?: string; code?: string } | null | undefined): boolean => {
  const message = String(error?.message || '')
  return error?.code === 'email_exists' || /already been registered|already exists|duplicate/i.test(message)
}
