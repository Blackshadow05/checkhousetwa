# Análisis de puntos blancos

El formulario toma o selecciona una foto, analiza la imagen original antes de comprimirla, solicita la habitación y presenta el conteo con marcas numeradas. El usuario confirma o corrige la cantidad, el estado y la habitación antes de incorporarla al reporte.

- 0 puntos: `en buen estado`.
- 1 a 8 puntos: `moderada`.
- 9 o más: `grave`.
- `defectuosa` (mostrada como «Otro daño») y `no hay pantalla` siguen disponibles manualmente y los registros anteriores siguen siendo válidos.

Las notas automáticas incluyen únicamente pantallas con daño. Cambiar una foto a buen estado, quitarla o cambiar su habitación actualiza el resumen. El texto adicional del usuario se conserva; si reescribe por completo el resumen generado, se respeta su redacción. Los movimientos tienen sus propias notas. El conteo confirmado se guarda como `puntos` opcional en cada elemento del JSON existente `fotos`.

## Motor y límites

`@techstark/opencv-js` está fijado en `4.12.0-release.1`. `scripts/build-pantalla-analyzer.mjs` copia el motor y su licencia y compila el worker en `public/opencv/` al ejecutar `pnpm dev`, `pnpm dev:pwa` o `pnpm build`. Estos archivos generados no se versionan. Si se modifica el detector durante una sesión de desarrollo, ejecutar nuevamente el script y recargar la página.

El análisis trabaja a un máximo de 1200 px, en un Web Worker. Busca primero un marco cerrado sin unirlo a las patas del televisor y solo intenta cerrar bordes si hace falta. Resta la iluminación local y aplica **dos umbrales de contraste** (6 y 14), cada uno con su propia pasada de contornos: el nivel tenue capta cualquier brillo de la pantalla y el nivel fuerte separa los puntos que el ruido JPEG puentea con su entorno; la deduplicación conserva una sola marca por punto. El detector ya no descarta por caída radial débil ni por formas moderadamente alargadas: casi cualquier brillo dentro del panel se conserva como candidato con sus mediciones, y la decisión final la toma la IA. Solo se descartan el texto y los íconos de menú con bordes muy duros, los brillos diminutos (menos de ~0,6 % del lado corto) y el ruido que no alcanza el nivel fuerte. Los puntos cercanos al bisel que el polígono deja "fuera" por un ajuste imperfecto tampoco se descartan: se conservan como dudosos para revisión. La lista se acota a los 30 candidatos más contrastados. Libera las matrices y termina el worker al finalizar, fallar, cancelar o superar 45 segundos. La imagen no se envía a ningún servicio de análisis durante esta etapa.

Cada candidato recibe además una confianza `seguro` o `dudoso` según qué tan cerca quedó de los límites de las heurísticas (pantalla no delimitada, bajo contraste, poca circularidad, textura de posible reflejo, forma alargada o caída radial débil), junto con sus mediciones (`features`: circularidad, relación de ejes, pico de contraste, nitidez interna, caída radial y diámetro relativo).

Cuando hay candidatos y hay conexión, **Jev decide el conteo final** (`POST /api/pantallas/jev`, modelo `jev-latest` de TypeSafe). Jev no ve la foto: evalúa las mediciones de cada candidato —seguro o dudoso— con una pregunta Noul por candidato (todas en una sola petición) y devuelve la probabilidad calibrada de que la mancha sea un punto blanco (defecto luminoso) y no un reflejo u otro brillo. Basta que la probabilidad sea de al menos 60 % para contarlo como punto; las manchas alargadas, irregulares, tenues o con textura interna no se cuentan. Los candidatos confirmados se marcan en verde y los descartados en ámbar para que el usuario vea lo revisado.

Existe además una revisión visual opcional con `gpt-5.6-luna` (`POST /api/pantallas/vision`, Responses API, salida JSON estructurada, detalle `high`) que envía marcadores numerados dibujados sobre la foto junto con las coordenadas normalizadas. Actualmente está **desactivada** mientras se valida el pipeline OpenCV + Jev; para reactivarla basta llamar `verifyPuntosConIA` desde el formulario con los puntos que Jev no confirmó.

La clave `TYPESAFE_API_KEY` vive únicamente en el servidor (y `OPENAI_API_KEY` si se reactiva Luna). Sin ella, sin conexión o ante cualquier fallo de la IA, el flujo conserva el resultado local de OpenCV sin cambios.

Es un detector heurístico de manchas luminosas difusas como las de la referencia, no una garantía de diagnóstico. Reflejos redondos, contenido del televisor, fotos desenfocadas, puntos muy pequeños o luz insuficiente pueden alterar el resultado. Conviene fotografiar toda la pantalla de frente, oscura, sin menús ni reflejos. Si no se identifica el borde de la pantalla, se requiere seleccionar el estado manualmente; un fallo del motor nunca equivale a cero puntos.

Serwist precarga el worker pequeño y conserva el motor versionado al primer uso. El análisis posterior funciona sin conexión mientras esa caché permanezca disponible. Sin el motor descargado, el formulario permite clasificar manualmente. Guardar el reporte sigue requiriendo conexión.

Referencias: [carga y memoria de OpenCV.js](https://docs.opencv.org/4.13.0/d0/d84/tutorial_js_usage.html), [contornos](https://docs.opencv.org/4.13.0/dc/dcf/tutorial_js_contour_features.html), [runtime fijado y su inicialización](https://github.com/TechStark/opencv-js), [datos JSON en Supabase](https://supabase.com/docs/guides/database/json).

## Verificación

```powershell
pnpm test:pantallas
# Opcional: incluir la foto de referencia sin copiarla al repositorio.
$env:PANTALLA_TEST_IMAGE = 'C:/ruta/a/IMG_2473.jpeg'
$env:PANTALLA_REFLECTION_TEST_IMAGE = 'C:/ruta/a/pantalla_21_1_1789412256024.jpg'
pnpm test:pantallas
pnpm type-check
pnpm build
```

Las pruebas cubren imágenes sintéticas con 0, 1, 5, 8, 9 y 15 puntos, puntos brillantes, ausencia de pantalla, límites de clasificación, notas y el payload de guardado. Con las dos referencias se verificaron cinco y ocho puntos respectivamente en las imágenes originales, JPEG al 75 %, WebP al 70 % y rotación de 90°. La segunda prueba también verifica sus ubicaciones, para impedir que un reflejo sustituya un defecto aunque el total coincida.

También se verificó el componente real con Chrome y vistas móviles de 360 y 390 px, con sesión/subida/guardado simulados: revisión de marcas, correcciones, habitaciones duplicadas, eliminación, cancelación de reemplazo, controles de al menos 44 px, ausencia de desbordamiento horizontal, caché del service worker de producción, análisis sin conexión y reconexión. No se escribieron registros remotos. Quedan pendientes las pruebas de cámara y experiencia instalada en iPhone y Android físicos, y la validación del guardado remoto.
