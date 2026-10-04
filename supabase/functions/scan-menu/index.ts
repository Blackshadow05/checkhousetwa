import { sesionAppValida } from '../_shared/app-session.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_BASE64_LENGTH = 18_000_000
const emptyMealLabels = new Set([
  'n/a',
  'ninguno',
  'no disponible',
  'no hay informacion',
  'sin datos',
  'sin informacion',
  'sin informacion disponible',
])

const isMeaningfulMeal = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return false
  const normalized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
  return !emptyMealLabels.has(normalized)
}

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  },
)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  const authorization = request.headers.get('Authorization') || ''
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!(await sesionAppValida(Deno.env.get('SUPABASE_URL') || '', jwt))) {
    return jsonResponse({ error: 'Inicia sesión para escanear el menú.' }, 401)
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      console.error('GEMINI_API_KEY no está configurada en los secretos de la función.')
      return jsonResponse({ error: 'El servicio de escaneo no está configurado.' }, 500)
    }

    const body = await request.json()
    const imageBase64 = body?.imageBase64
    const mimeType = body?.mimeType
    const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.referenceDate || '')
      ? body.referenceDate
      : new Date().toISOString().slice(0, 10)

    if (typeof imageBase64 !== 'string' || !imageBase64) {
      return jsonResponse({ error: 'No se recibió una imagen válida.' }, 400)
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return jsonResponse({ error: 'La imagen es demasiado grande para analizarla.' }, 413)
    }

    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      return jsonResponse({ error: 'El archivo enviado no es una imagen válida.' }, 400)
    }

    const prompt = `
      Analiza esta imagen y extrae el menú de comida detallado por días.

      Consideraciones:
      - Si no hay fecha explícita, usa hoy (${referenceDate}) como referencia para calcular el resto de la semana.
      - Si la imagen muestra un menú semanal, extrae cada día por separado.
      - Conserva los nombres de los platillos tal como aparecen en la imagen.
    `

    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: imageBase64, mimeType } },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                menus: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      dia_semana: {
                        type: 'string',
                        description: 'Día de la semana en español.',
                      },
                      fecha: {
                        type: 'string',
                        description: 'Fecha en formato YYYY-MM-DD.',
                      },
                      comidas: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['dia_semana', 'fecha', 'comidas'],
                  },
                },
              },
              required: ['menus'],
            },
          },
        }),
      },
    )

    if (!geminiResponse.ok) {
      const providerError = await geminiResponse.text()
      console.error('Gemini API error:', geminiResponse.status, providerError.slice(0, 1000))

      if (geminiResponse.status === 429) {
        return jsonResponse({ error: 'Se alcanzó temporalmente el límite de escaneos. Inténtalo más tarde.' }, 429)
      }

      return jsonResponse({ error: 'Gemini no pudo analizar la imagen.' }, 502)
    }

    const geminiData = await geminiResponse.json()
    const responseText = geminiData?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim()

    if (!responseText) {
      return jsonResponse({ error: 'Gemini no detectó información en la imagen.' }, 422)
    }

    const extracted = JSON.parse(responseText)
    const menus = Array.isArray(extracted?.menus)
      ? extracted.menus
        .filter((menu: unknown) => {
          if (!menu || typeof menu !== 'object') return false
          const candidate = menu as Record<string, unknown>
          return typeof candidate.dia_semana === 'string'
            && /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.fecha || ''))
            && Array.isArray(candidate.comidas)
            && candidate.comidas.some(isMeaningfulMeal)
        })
        .map((menu: { dia_semana: string; fecha: string; comidas: string[] }) => ({
          dia_semana: menu.dia_semana.trim(),
          fecha: menu.fecha,
          comidas: menu.comidas
            .filter(isMeaningfulMeal)
            .map((comida) => comida.trim()),
        }))
      : []

    if (menus.length === 0) {
      return jsonResponse({ error: 'No se detectaron menús en la imagen.' }, 422)
    }

    return jsonResponse({ menus })
  } catch (error) {
    console.error('scan-menu error:', error)
    return jsonResponse({ error: 'No se pudo procesar el escaneo.' }, 500)
  }
})
