create table if not exists private.canales_realtime (
  nombre text primary key,
  topic text not null unique
);

revoke all on table private.canales_realtime from public, anon, authenticated;

insert into private.canales_realtime (nombre, topic)
values ('revisiones_casitas', 'revisiones-casitas:' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (nombre) do nothing;

create or replace function private.topic_revisiones_casitas()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select topic from private.canales_realtime where nombre = 'revisiones_casitas'
$function$;

revoke all on function private.topic_revisiones_casitas() from public, anon, authenticated;
grant execute on function private.topic_revisiones_casitas() to service_role;

create or replace function public.topic_revisiones_casitas()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.topic_revisiones_casitas()
$function$;

revoke all on function public.topic_revisiones_casitas() from public, anon, authenticated;
grant execute on function public.topic_revisiones_casitas() to service_role;

create or replace function private.avisar_cambio_revisiones_casitas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  destino text := private.topic_revisiones_casitas();
begin
  if destino is not null then
    begin
      perform realtime.send(jsonb_build_object('op', tg_op), 'cambio', destino, true);
    exception when others then
      null;
    end;
  end if;
  return null;
end
$function$;

revoke all on function private.avisar_cambio_revisiones_casitas() from public, anon, authenticated, service_role;

drop trigger if exists trg_revisiones_casitas_avisar_cambio on public.revisiones_casitas;
create trigger trg_revisiones_casitas_avisar_cambio
after insert or update or delete on public.revisiones_casitas
for each statement execute function private.avisar_cambio_revisiones_casitas();

do $do$
begin
  drop policy if exists revisiones_casitas_escuchar_cambios on realtime.messages;
  execute format(
    'create policy revisiones_casitas_escuchar_cambios on realtime.messages for select to anon, authenticated using (extension = %L and (select realtime.topic()) = %L)',
    'broadcast',
    private.topic_revisiones_casitas()
  );
end
$do$;
