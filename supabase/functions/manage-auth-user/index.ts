import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'
import { sesionAppValida } from '../_shared/app-session.ts'
import {
  isUserManager,
  normalizeEmail,
  PROFILE_COLUMNS,
  type UsuarioRecord,
} from '../_shared/auth-rules.ts'
import {
  getBearerToken,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  resolveServiceKey,
  resolveSupabaseUrl,
} from '../_shared/http.ts'

const AUTH_SOURCE_METADATA = { auth_source: 'authenticator' }

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

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
    console.error('manage-auth-user: falta configuración de Supabase.')
    return jsonResponse({ ok: false, error: 'La función no está configurada.' }, 500)
  }

  const jwt = getBearerToken(request)
  if (!jwt) {
    return jsonResponse({ ok: false, error: 'Inicia sesión para administrar autenticación.' }, 401)
  }

  if (!(await sesionAppValida(supabaseUrl, jwt))) {
    return jsonResponse({ ok: false, error: 'Sesión no válida o expirada.' }, 401)
  }

  const body = await readJsonBody(request)
  if (!body) {
    return jsonResponse({ ok: false, error: 'Solicitud inválida.' }, 400)
  }

  const action = body.action === 'reset_mfa' ? 'reset_mfa' : 'invite'
  const usuarioNombre = String(body.usuario || '').trim()

  if (!usuarioNombre) {
    return jsonResponse({ ok: false, error: 'El usuario es obligatorio.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    const managerAuthUser = authData?.user

    if (authError || !managerAuthUser?.id) {
      return jsonResponse({ ok: false, error: 'Sesión no válida o expirada.' }, 401)
    }

    const { data: managerProfile, error: managerError } = await admin
      .from('Usuarios')
      .select('Usuario, Rol')
      .eq('auth_user_id', managerAuthUser.id)
      .maybeSingle<Pick<UsuarioRecord, 'Usuario' | 'Rol'>>()

    if (managerError) {
      console.error('manage-auth-user: error consultando al manager:', managerError.message)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (!isUserManager(managerProfile)) {
      return jsonResponse({ ok: false, error: 'No tienes permiso para administrar autenticación.' }, 403)
    }

    const managerNombre = managerProfile?.Usuario || ''

    const { data: target, error: targetError } = await admin
      .from('Usuarios')
      .select(PROFILE_COLUMNS)
      .eq('Usuario', usuarioNombre)
      .maybeSingle<UsuarioRecord>()

    if (targetError || !target) {
      return jsonResponse({ ok: false, error: 'No se encontró ese usuario en la app.' }, 404)
    }

    if (action === 'reset_mfa') {
      if (!target.auth_user_id) {
        return jsonResponse({ ok: false, error: 'Ese usuario todavía no tiene cuenta de Authenticator.' }, 400)
      }

      const factorsRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${target.auth_user_id}/factors`,
        {
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
        },
      )
      const factorsJson = await factorsRes.json().catch(() => null)
      const factors = Array.isArray(factorsJson)
        ? factorsJson
        : (factorsJson?.factors || factorsJson?.totp || [])

      for (const factor of factors) {
        const factorId = factor?.id
        if (!factorId) continue
        await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${target.auth_user_id}/factors/${factorId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
          },
        )
      }

      const { error: metadataError } = await admin.auth.admin.updateUserById(
        target.auth_user_id,
        { app_metadata: AUTH_SOURCE_METADATA },
      )

      if (metadataError) {
        console.error('manage-auth-user: no se pudo actualizar app_metadata:', metadataError.message)
      }

      const { error: updateError } = await admin
        .from('Usuarios')
        .update({ totp_enrolled: false })
        .eq('id', target.id)

      if (updateError) {
        return jsonResponse({ ok: false, error: updateError.message }, 400)
      }

      return jsonResponse({
        ok: true,
        message: 'Authenticator restablecido. El usuario debe volver a escanear el QR.',
      })
    }

    const email = normalizeEmail(body.email)
    const authPassword = String(body.authPassword || '')

    if (!isEmail(email)) {
      return jsonResponse({ ok: false, error: 'El correo no es válido.' }, 400)
    }
    if (authPassword.length < 6) {
      return jsonResponse({ ok: false, error: 'La contraseña de Auth debe tener al menos 6 caracteres.' }, 400)
    }

    const { data: existingByEmail, error: emailError } = await admin
      .from('Usuarios')
      .select('id, Usuario')
      .ilike('email', email)
      .maybeSingle<Pick<UsuarioRecord, 'id' | 'Usuario'>>()

    if (emailError) {
      console.error('manage-auth-user: error consultando correo:', emailError.message)
      return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
    }

    if (existingByEmail && existingByEmail.id !== target.id) {
      return jsonResponse({ ok: false, error: `Ese correo ya está asignado a ${existingByEmail.Usuario}.` }, 409)
    }

    let authUserId = target.auth_user_id

    if (!authUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: authPassword,
        email_confirm: true,
        user_metadata: {
          Usuario: target.Usuario,
          Rol: target.Rol,
          invited_by: managerNombre,
        },
        app_metadata: AUTH_SOURCE_METADATA,
      })

      if (createError) {
        const alreadyExists = /already been registered|already exists|duplicate/i.test(createError.message || '')
        if (!alreadyExists) {
          return jsonResponse({ ok: false, error: createError.message }, 400)
        }

        const { data: listData, error: listError } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })
        if (listError) {
          return jsonResponse({ ok: false, error: listError.message }, 400)
        }

        const found = (listData?.users || []).find((user) => user.email?.toLowerCase() === email)
        if (!found) {
          return jsonResponse({ ok: false, error: 'El correo ya existe en Auth pero no se pudo vincular.' }, 400)
        }

        const { error: updateAuthError } = await admin.auth.admin.updateUserById(found.id, {
          password: authPassword,
          email_confirm: true,
          user_metadata: {
            Usuario: target.Usuario,
            Rol: target.Rol,
            invited_by: managerNombre,
          },
          app_metadata: AUTH_SOURCE_METADATA,
        })
        if (updateAuthError) {
          return jsonResponse({ ok: false, error: updateAuthError.message }, 400)
        }
        authUserId = found.id
      } else {
        authUserId = created.user?.id || null
      }
    } else {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        password: authPassword,
        email_confirm: true,
        app_metadata: AUTH_SOURCE_METADATA,
      })
      if (updateAuthError) {
        return jsonResponse({ ok: false, error: updateAuthError.message }, 400)
      }
    }

    if (!authUserId) {
      return jsonResponse({ ok: false, error: 'No se pudo crear la cuenta de Auth.' }, 500)
    }

    const { error: linkError } = await admin
      .from('Usuarios')
      .update({
        email,
        auth_user_id: authUserId,
        totp_enrolled: target.auth_user_id ? Boolean(target.totp_enrolled) : false,
      })
      .eq('id', target.id)

    if (linkError) {
      return jsonResponse({ ok: false, error: linkError.message }, 400)
    }

    return jsonResponse({
      ok: true,
      message: 'Cuenta de Authenticator lista. El usuario debe entrar con correo, contraseña de Auth y el QR.',
      auth_user_id: authUserId,
      email,
    })
  } catch (error) {
    console.error('manage-auth-user error:', error)
    return jsonResponse({ ok: false, error: 'Ocurrió un error inesperado.' }, 500)
  }
})
