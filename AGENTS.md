<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Experiencia móvil de este proyecto

- Diseñar primero para Android y iPhone: pantallas continuas, encabezados compactos, navegación inferior persistente, tarjetas en lugar de tablas y paneles inferiores para tareas breves.
- Mantener búsqueda, filtros y posición de scroll entre pantallas. Navegar en cliente sin recargar el documento; no reconstruir el app shell.
- Respetar las cuatro safe areas con `env(safe-area-inset-*)`, altura dinámica del viewport y controles táctiles de al menos 44–48 px. Evitar scroll horizontal y ocultar barras de scroll.
- Usar una identidad visual coherente, tipografía móvil, estados vacíos útiles, skeletons y transiciones breves que respeten movimiento reducido. No depender de hover.
- Mantener manifest standalone, iconos adaptables, splash, colores de tema y orientación coherentes con la interfaz.
- Usar IndexedDB cuando aporte valor; conservar los últimos datos ante errores, distinguir datos guardados de datos actualizados y recuperar la conexión sin interrumpir al usuario. No afirmar que un cambio se sincronizó antes de confirmarlo.
- Para cambios simples usar optimistic UI con recuperación de errores; usar cámara, archivos, compartir, clipboard y push solo cuando aporten a un flujo real.
- No introducir menús principales tipo web, formularios interminables, nuevas pestañas innecesarias, detalles técnicos en los flujos de producto ni acciones aparentes sin funcionalidad.
- Verificar móvil, accesibilidad y modo offline. Distinguir pruebas emuladas de pruebas en iPhone y Android físicos; estas últimas deben realizarse antes de dar por validada la experiencia instalada.
