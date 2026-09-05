# Experiencia móvil de Casitas

El inicio presenta las últimas 100 revisiones reales en tarjetas agrupadas por fecha. Conserva casita, responsable, caja fuerte y fecha sin convertir los valores de caja fuerte en un estado general de la revisión. El resumen cuenta únicamente los registros descargados, no el total histórico.

La búsqueda local acepta nombres sin tildes. Los filtros incluyen todas las fechas, hoy, últimos siete días y los valores reales de caja fuerte. Cada tarjeta abre un panel inferior accesible con el detalle y una acción para copiarlo. La lista muestra 20 registros inicialmente y permite ampliar hasta los 100 descargados.

Las tres pantallas permanecen montadas. Cada una conserva filtros y scroll; cambiar de pestaña y usar el historial del navegador no recarga el documento. La acción flotante permite volver al inicio de una lista larga. La pestaña Revisiones permite explorar los mismos registros; crear o editar revisiones queda fuera de esta primera pantalla.

## PWA y recuperación

- Manifest standalone, orientación vertical preferida, safe areas en los cuatro bordes y tema claro/oscuro.
- Iconos de 192 y 512 px, variantes maskable con margen seguro, icono Apple y pantallas de arranque para varios tamaños de iPhone. Regeneración: `node scripts/generate-pwa-assets.mjs`.
- IndexedDB conserva una copia de las últimas revisiones. Un error de red no reemplaza los datos disponibles por una lista vacía. Si falla el almacenamiento, se informa sin bloquear la consulta.
- El service worker precarga la pantalla de respaldo, que abre el mismo app shell y restaura IndexedDB. Se requiere haber abierto la aplicación con conexión al menos una vez.
- Al recuperar conexión, se intenta actualizar sin recargar; hay un segundo intento breve si la red aún no está lista y una acción de reintento si vuelve a fallar.
- Las versiones nuevas esperan una acción explícita en el aviso de actualización. Esa acción recarga para activar la versión; la navegación normal y la reconexión no lo hacen.
- Es consulta offline: no se han implementado altas, edición ni cola de escrituras.

## Validación

- `pnpm type-check`, `pnpm lint` y `pnpm build`.
- Chromium: búsqueda, combinación de filtros, estado vacío, panel de detalle, navegación sin reconstruir el header, conservación del scroll y consulta de datos sin señal.
- Tamaños de viewport: 320 × 568, 390 × 844, 412 × 915, 844 × 390 y 1280 × 900, sin desbordamiento horizontal. Revisión visual en claro y oscuro.
- En producción: registro del service worker, aviso de actualización y apertura de una dirección no visitada previamente sin conexión, recuperando los 100 registros de IndexedDB.

Pendiente en dispositivos físicos: instalar desde Safari en iPhone y Chrome en Android; comprobar splash, áreas seguras, teclado, VoiceOver/TalkBack, texto ampliado, modo avión, cierre y reapertura, y recuperación al cambiar entre Wi-Fi y datos móviles. La emulación no sustituye estas pruebas.

Para probar PWA se necesita una compilación de producción (`pnpm build` y `pnpm start`) y HTTPS para el acceso desde otros dispositivos. El service worker está deshabilitado en desarrollo.

## Herramientas

TypeScript 7 se conserva para `pnpm type-check`. ESLint usa la API compatible de TypeScript 6 mediante los alias descritos por [Microsoft](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0). Next usa esa API al compilar porque su comprobación CLI busca un ejecutable `tsc` y el paquete compatible expone `tsc6`. No se omiten los errores de tipos.

Serwist detecta y versiona automáticamente la salida estática de `/~offline`. No agregar esa misma URL con otra revisión: las entradas duplicadas impiden iniciar el service worker. El manejador de errores de navegación recupera la copia precargada incluso cuando pnpm resuelve más de una instancia del paquete Serwist.
