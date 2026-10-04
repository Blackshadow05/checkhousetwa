-- Read-only permission probes: EXPLAIN, without ANALYZE, never runs the DML.
-- Requires a database administrator who can SET ROLE anon.
do $test$
declare
  owner_role text := current_user;
  target text;
  command text;
  statement text;
  writable_column text;
  denied integer := 0;
begin
  foreach target in array array['revisiones_casitas', 'reporte_pantallas',
    'notas_revisiones_casitas', 'inventario_pantallas', 'horarios', 'operaciones_memo']
  loop
    select attname into writable_column from pg_attribute
      where attrelid = format('public.%I', target)::regclass
        and attnum > 0 and not attisdropped and attidentity = '' and attgenerated = ''
      order by attnum limit 1;
    foreach command in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    loop
      statement := case command
        when 'SELECT' then format('explain select 1 from public.%I limit 0', target)
        when 'INSERT' then format('explain insert into public.%I default values', target)
        when 'UPDATE' then format('explain update public.%I set %I = %I where false', target, writable_column, writable_column)
        when 'DELETE' then format('explain delete from public.%I where false', target)
      end;
      perform set_config('role', 'anon', true);
      begin
        execute statement;
        raise exception 'Acceso anónimo inesperado: % en %', command, target;
      exception when insufficient_privilege then
        denied := denied + 1;
      end;
      perform set_config('role', owner_role, true);
    end loop;
  end loop;
  if denied <> 24 then raise exception 'Se esperaban 24 operaciones denegadas, se obtuvieron %', denied; end if;
end;
$test$;
select 'PASS: 24 operaciones anónimas denegadas; ningún DML ejecutado' as result;
