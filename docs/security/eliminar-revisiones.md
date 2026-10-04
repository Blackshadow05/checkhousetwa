# Eliminar revisiones

La ruta `/eliminar-revisiones` aparece en Otros exclusivamente para el rol exacto `SuperAdmin`. Las acciones de lectura y borrado vuelven a consultar la sesión y el rol almacenado; no aceptan un usuario, rol o IP enviado en el formulario.

La selección se puede hacer individualmente o cargar y seleccionar los 200 registros más recientes, ordenados por `created_at DESC NULLS LAST, id DESC`. Cada operación admite de 1 a 200 UUID distintos. Se puede desmarcar cualquier registro antes de confirmar. La advertencia fija los IDs seleccionados; el siguiente paso pide un código nuevo del Authenticator de la misma cuenta. Una sesión AAL2 existente por sí sola no autoriza otra eliminación.

El servidor verifica un challenge TOTP nuevo y llama a una RPC ejecutable únicamente con `service_role`. El wrapper público usa `SECURITY INVOKER`. La función privilegiada reside en `private` porque necesita consultar tablas internas de Auth: valida el perfil actual, la cuenta Auth, la sesión AAL2 vigente y un challenge verificado hace menos de 60 segundos. La columna única `challenge_id` impide reutilizar el challenge. La función bloquea el perfil y los registros; si algún ID ya no existe, falla toda la operación. El borrado y la auditoría forman una única transacción. Las notas siguen la relación existente `ON DELETE CASCADE`; los archivos externos de evidencia no se eliminan.

`registros_eliminados` guarda fecha UTC (mostrada en Costa Rica), ID y nombre histórico del usuario, IP, cantidad, IDs borrados y challenge. No es una copia recuperable del contenido eliminado. RLS está habilitado y forzado. Solo un SuperAdmin con sesión válida puede leer los campos de la pantalla. `anon` no tiene acceso y `authenticated` no tiene privilegios de inserción, actualización, borrado ni truncado. Un trigger también rechaza actualización, borrado y truncado del historial. Los usuarios autenticados tampoco pueden eliminar revisiones directamente, aun con las políticas ALL anteriores.

La IP se obtiene del encabezado `x-vercel-forwarded-for` únicamente cuando el servidor se ejecuta en Vercel. Fuera de ese proxy confiable se registra NULL y se muestra «No disponible»; no se inventa una IP ni se confían encabezados arbitrarios. Véase [la documentación de encabezados de Vercel](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).

La pantalla conserva filtros, selección y datos en memoria al navegar entre vistas; el historial no se persiste en IndexedDB. Sin conexión se bloquea la eliminación. Un resultado de red ambiguo pide consultar el historial antes de reintentar. Tras una confirmación se retiran las revisiones del estado de Inicio y del archivo de revisiones y se actualiza la copia de Inicio.

## Verificación

- `node scripts/test-eliminar-revisiones.mjs`: autorización por rol, cuenta vinculada, MFA nuevo, errores, límites, paginación y extracción de IP, sin llamadas a Supabase real.
- `scripts/security-audit-eliminar-revisiones.sql`: comprobaciones remotas de denegación; no borra revisiones reales ni crea entradas de auditoría.
- Build de Next.js y TypeScript.
- Pantalla con acciones simuladas en viewport móvil: selección de 200, desmarcado, confirmación, código incorrecto, éxito, historial y bloqueo offline.

La prueba de borrado real con un código TOTP de un SuperAdmin y la validación de la experiencia instalada en iPhone/Android físicos deben hacerse con el usuario. El frontend requiere su despliegue habitual para aparecer en la aplicación publicada.
