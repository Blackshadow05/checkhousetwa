import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'
import { LOGIN_METHODS, type UsuarioRecord } from './auth-rules.ts'

export type LoginMetodo = (typeof LOGIN_METHODS)[keyof typeof LOGIN_METHODS]

export interface LoginEventInput {
  metodo: LoginMetodo
  ipAddress: string | null
  userAgent: string | null
}

const DEDUPE_WINDOW_MS = 90 * 1000

export interface LoginEventResult {
  ok: boolean
  duplicated: boolean
  loggedAt: string
  ipAddress: string | null
  error?: string
}

export const recordLoginEvent = async (
  admin: SupabaseClient,
  profile: Pick<UsuarioRecord, 'id' | 'Usuario'>,
  input: LoginEventInput,
): Promise<LoginEventResult> => {
  const loggedAt = new Date().toISOString()
  const ipAddress = input.ipAddress

  const result: LoginEventResult = {
    ok: false,
    duplicated: false,
    loggedAt,
    ipAddress,
  }

  try {
    let isDuplicate = false

    if (ipAddress) {
      const { data: lastLog } = await admin
        .from('login_logs')
        .select('id, logged_at, ip_address')
        .eq('user_id', profile.id)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const lastLoggedAt = lastLog?.logged_at ? new Date(lastLog.logged_at).getTime() : 0
      isDuplicate = lastLog
        ? lastLog.ip_address === ipAddress &&
          Number.isFinite(lastLoggedAt) &&
          Date.now() - lastLoggedAt < DEDUPE_WINDOW_MS
        : false
    }

    result.duplicated = isDuplicate

    if (!isDuplicate) {
      const { error: insertError } = await admin.from('login_logs').insert({
        user_id: profile.id,
        usuario: profile.Usuario,
        ip_address: ipAddress,
        user_agent: input.userAgent,
        metodo: input.metodo,
        logged_at: loggedAt,
      })

      if (insertError) {
        result.error = insertError.message
        return result
      }
    }

    const { error: updateError } = await admin
      .from('Usuarios')
      .update({
        ultimo_login_at: loggedAt,
        ultimo_login_ip: ipAddress,
      })
      .eq('id', profile.id)

    if (updateError) {
      result.error = updateError.message
      return result
    }

    result.ok = true
    return result
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'No se pudo registrar el acceso.'
    return result
  }
}
