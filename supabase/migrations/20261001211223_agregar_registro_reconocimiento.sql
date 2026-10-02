set local lock_timeout = '5s';

alter table public.revisiones_casitas
  add column registro_reconocimiento jsonb,
  add constraint revisiones_casitas_registro_reconocimiento_check check (
    registro_reconocimiento is null or (
      jsonb_typeof(registro_reconocimiento) = 'object'
      and registro_reconocimiento ->> 'version' = '1'
      and jsonb_typeof(registro_reconocimiento -> 'articulos') = 'array'
      and not jsonb_path_exists(
        registro_reconocimiento,
        '$.articulos[*] ? (@.campo == "camas_ordenadas" || @.campo == "usb_speaker")'
      )
    ) is true
  );

comment on column public.revisiones_casitas.registro_reconocimiento is
  'Fallos originales del reconocimiento y cambios a sus valores: detectado, inventario al guardar, valor del escaneo y valor guardado. Excluye camas_ordenadas y usb_speaker. NULL indica una revisión sin registro de reconocimiento.';
