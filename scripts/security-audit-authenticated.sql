do $test$
declare
  owner_role text := current_user;
  target text;
  visible bigint;
  fallos text := '';
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid(), 'role', 'authenticated', 'session_id', gen_random_uuid(), 'aal', 'aal1',
    'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint))
  )::text, true);
  perform set_config('role', 'authenticated', true);

  foreach target in array array['revisiones_casitas', 'reporte_pantallas', 'notas_revisiones_casitas',
    'inventario_pantallas', 'horarios', 'operaciones_memo', 'Usuarios', 'login_logs',
    'vista_ultimas_revisiones', 'revisiones_casitas_completa']
  loop
    begin
      execute format('select count(*) from public.%I', target) into visible;
      if visible > 0 then
        fallos := fallos || format(' %s=%s filas', target, visible);
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  begin
    insert into public.notas_revisiones_casitas (revision_id, nota) values (gen_random_uuid(), 'auditoria');
    fallos := fallos || ' insert_notas';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.confirmar_montaje_manual(gen_random_uuid());
    fallos := fallos || ' rpc_confirmar_montaje';
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('role', owner_role, true);

  if fallos <> '' then
    raise exception 'FALLA: una sesión de Auth sin login de la app tiene acceso:%', fallos;
  end if;
  raise exception 'PASS: una sesión de Auth sin login de la app no ve ni modifica datos privados';
end;
$test$;
