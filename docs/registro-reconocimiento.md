# Registro del reconocimiento

`revisiones_casitas.registro_reconocimiento` es un campo JSONB nullable.
Se escribe junto con una revisión nueva por reconocimiento. El servidor valida
los conteos, consulta el inventario de la casita al guardar y construye el JSON.
Las revisiones manuales y las filas anteriores conservan `NULL`.

El registro contiene:

- Modelo y fecha del escaneo (los borradores anteriores pueden no indicar modelo).
- Fecha de comparación y disponibilidad del inventario al guardar.
- Artículos cuyo conteo original requiere revisión, incluso después de corregirlos.
- Artículos inicialmente identificados cuyo valor final cambió manualmente.

Cada artículo incluye `campo`, `detectado`, `inventario`, `valor_escaneo`,
`valor_guardado`, `estado_escaneo` y `modificado_por_usuario`. La comparación
usa el inventario al guardar, identificado con `inventario_comparado_en`.
El cambio manual se determina comparando el valor final con el valor que el
escaneo llenó automáticamente; los cambios intermedios que se revierten no se registran.
Para cantidades limitadas por el formulario se conserva también el conteo bruto.

Ejemplo: el escaneo encontró un Chromecast donde el inventario tiene dos,
y el usuario cambió a dos. Además cambió un speaker correctamente identificado:

```json
{
  "version": 1,
  "modelo": "yolo26n-v8",
  "escaneado_en": "2026-10-01T20:00:00.000Z",
  "inventario_comparado_en": "2026-10-01T20:05:00.000Z",
  "inventario_disponible": true,
  "articulos": [
    {
      "campo": "chromecast",
      "detectado": 1,
      "inventario": 2,
      "valor_escaneo": "1",
      "valor_guardado": "2",
      "estado_escaneo": "revisar",
      "modificado_por_usuario": true
    },
    {
      "campo": "speaker",
      "detectado": 1,
      "inventario": 1,
      "valor_escaneo": "1",
      "valor_guardado": "2",
      "estado_escaneo": "identificado",
      "modificado_por_usuario": true
    }
  ]
}
```

`camas_ordenadas` y `usb_speaker` se excluyen de la construcción del registro.
La restricción SQL también rechaza esos campos dentro de `articulos`.
Las cantidades del inventario no se muestran en las pistas del formulario.
Si cambian las fotos, es necesario volver a escanear antes de guardar.

Pruebas locales: `node scripts/test-revision-recognition-log.mjs`.

Al final de los detalles de la revisión, «Reconocimiento» presenta cada artículo
del registro con «Detectado» y «Usuario» (`valor_guardado`). Los campos booleanos
se muestran como Sí/No y un conteo ausente como «Sin dato». No se presentan
inventario, modelo, fechas ni estados del escaneo en esta sección. El valor de
usuario es el conservado al guardar la revisión, aunque posteriormente se edite
el artículo desde los detalles.

La consulta compartida incluye el JSON y el mapeo conserva solamente esos dos
valores y el campo para la pantalla y el snapshot de IndexedDB. Las revisiones
sin registro o sin artículos no muestran la sección. Pruebas del mapeo y lectura:
`node scripts/test-revision-recognition-detail.mjs`.
