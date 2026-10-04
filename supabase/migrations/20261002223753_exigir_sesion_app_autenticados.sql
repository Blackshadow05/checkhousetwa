set local lock_timeout = '5s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.app_session_valid()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  claims jsonb := auth.jwt();
  caller_id uuid := auth.uid();
  caller_session text := claims ->> 'session_id';
  profile_method text;
  profile_totp boolean;
  app_meta jsonb;
  authenticated_at double precision;
  now_epoch double precision := extract(epoch from now());
begin
  if caller_id is null
     or claims ->> 'role' is distinct from 'authenticated'
     or coalesce(claims ->> 'is_anonymous', 'false') = 'true'
     or caller_session is null then
    return false;
  end if;

  select u.metodo_login, coalesce(u.totp_enrolled, false)
    into profile_method, profile_totp
    from public."Usuarios" u
    where u.auth_user_id = caller_id and u."Rol" is distinct from 'inactivo'
    limit 1;
  if not found then
    return false;
  end if;

  select a.raw_app_meta_data into app_meta
    from auth.users a
    where a.id = caller_id
      and a.deleted_at is null
      and (a.banned_until is null or a.banned_until <= now());
  if not found then
    return false;
  end if;

  if not exists (
    select 1 from auth.sessions s
    where s.id = caller_session::uuid and s.user_id = caller_id
      and (s.not_after is null or s.not_after > now())
  ) then
    return false;
  end if;

  if jsonb_typeof(claims -> 'amr') is distinct from 'array' then
    return false;
  end if;
  select min((entry ->> 'timestamp')::double precision)
    into authenticated_at
    from jsonb_array_elements(claims -> 'amr') entry
    where jsonb_typeof(entry -> 'timestamp') = 'number';
  if authenticated_at is null
     or authenticated_at > now_epoch + 60
     or authenticated_at <= now_epoch - 28800 then
    return false;
  end if;

  if profile_method = 'google' then
    return (
      coalesce(app_meta ->> 'provider' = 'google', false)
      or coalesce(app_meta -> 'providers', '[]'::jsonb) ? 'google'
    ) and exists (
      select 1 from jsonb_array_elements(claims -> 'amr') entry
      where entry ->> 'method' = 'oauth'
    );
  end if;

  if profile_totp or exists (
    select 1 from auth.mfa_factors f
    where f.user_id = caller_id and f.status = 'verified'
  ) then
    return coalesce(claims ->> 'aal' = 'aal2', false);
  end if;

  return coalesce(app_meta ->> 'auth_source' = 'password', false);
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$function$;

revoke all on function private.app_session_valid() from public, anon;
grant execute on function private.app_session_valid() to authenticated, service_role;

create or replace function public.sesion_app_valida()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select private.app_session_valid();
$function$;

revoke all on function public.sesion_app_valida() from public, anon;
grant execute on function public.sesion_app_valida() to authenticated, service_role;

do $migration$
declare
  target record;
  existing record;
begin
  for target in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', target.relname);
    execute format('revoke all on table public.%I from public, anon', target.relname);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', target.relname);
  end loop;

  for target in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('menus', 'consejos_diarios', 'Usuarios', 'login_logs')
  loop
    execute format('drop policy if exists deny_anonymous_access on public.%I', target.relname);
    execute format('create policy deny_anonymous_access on public.%I as restrictive for all to anon using (false) with check (false)', target.relname);
    execute format('drop policy if exists require_app_session on public.%I', target.relname);
    execute format('create policy require_app_session on public.%I as restrictive for all to authenticated using ((select private.app_session_valid())) with check ((select private.app_session_valid()))', target.relname);
  end loop;

  for target in
    select unnest(array['revisiones_casitas', 'reporte_pantallas', 'notas_revisiones_casitas',
      'inventario_pantallas', 'horarios', 'operaciones_memo', 'Usuarios', 'login_logs']) as relname
  loop
    for existing in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target.relname
        and permissive = 'PERMISSIVE'
        and roles && array['public', 'anon', 'authenticated']::name[]
    loop
      execute format('drop policy %I on public.%I', existing.policyname, target.relname);
    end loop;
  end loop;

  for target in select unnest(array['Usuarios', 'login_logs']) as relname
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', target.relname);
    for existing in
      select a.attname from pg_attribute a
      where a.attrelid = format('public.%I', target.relname)::regclass
        and a.attnum > 0 and not a.attisdropped
    loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated', existing.attname, target.relname);
    end loop;
    execute format('drop policy if exists deny_anonymous_access on public.%I', target.relname);
    execute format('create policy deny_anonymous_access on public.%I as restrictive for all to anon using (false) with check (false)', target.relname);
  end loop;

  for target in
    select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null
  loop
    execute format('alter function %s set search_path = pg_catalog, public', target.signature);
  end loop;
end;
$migration$;

create policy acceso_usuarios_app on public.revisiones_casitas
  for all to authenticated using (true) with check (true);
create policy acceso_usuarios_app on public.notas_revisiones_casitas
  for all to authenticated using (true) with check (true);
create policy acceso_usuarios_app on public.reporte_pantallas
  for all to authenticated using (true) with check (true);
create policy acceso_usuarios_app on public.operaciones_memo
  for all to authenticated using (true) with check (true);
create policy lectura_usuarios_app on public.horarios
  for select to authenticated using (true);

revoke insert, update, delete on public.horarios from authenticated;
revoke all on public.inventario_pantallas from authenticated;

grant select (id, "Usuario", "Rol", metodo_login, email, auth_user_id, totp_enrolled)
  on public."Usuarios" to authenticated;
create policy perfil_propio on public."Usuarios"
  for select to authenticated using (auth_user_id = (select auth.uid()));
create policy solo_servidor on public.login_logs
  as restrictive for all to authenticated using (false) with check (false);

create policy require_app_session_insert on public.menus
  as restrictive for insert to authenticated
  with check ((select private.app_session_valid()));
create policy require_app_session_update on public.menus
  as restrictive for update to authenticated
  using ((select private.app_session_valid()))
  with check ((select private.app_session_valid()));
create policy require_app_session_delete on public.menus
  as restrictive for delete to authenticated
  using ((select private.app_session_valid()));

grant select on public.menus, public.consejos_diarios to anon;

alter view public.vista_ultimas_revisiones set (security_invoker = true);
alter view public.revisiones_casitas_completa set (security_invoker = true);
revoke all on public.vista_ultimas_revisiones, public.revisiones_casitas_completa from public, anon, authenticated;
grant select on public.vista_ultimas_revisiones, public.revisiones_casitas_completa to authenticated;

revoke execute on function public.montaje_es_manual(integer, integer, integer),
  public.montaje_tiene_checkin(integer, integer, integer),
  public.set_operaciones_memo_montaje_hecho()
  from public, anon, authenticated;
grant execute on function public.montaje_es_manual(integer, integer, integer),
  public.montaje_tiene_checkin(integer, integer, integer),
  public.set_operaciones_memo_montaje_hecho()
  to service_role;

create or replace function public.confirmar_montaje_manual(p_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_casita text;
  v_fecha  text;
  v_casita_num int;
  v_dia int;
  v_mes int;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not private.app_session_valid() then
    raise exception 'Inicia sesión para continuar.' using errcode = '42501';
  end if;

  select casita, fecha into v_casita, v_fecha
  from public.operaciones_memo where id = p_id;
  if not found then return false; end if;

  v_casita_num := public.om_casita_num(v_casita);
  v_dia        := public.om_fecha_dia(v_fecha);
  v_mes        := public.om_fecha_mes(v_fecha);
  if v_casita_num is null or v_dia is null or v_mes is null then
    return false;
  end if;

  insert into public.montajes_manuales (casita_num, dia, mes, casita_texto)
  values (v_casita_num, v_dia, v_mes, v_casita)
  on conflict (casita_num, dia, mes)
  do update set confirmado_at = now(), casita_texto = excluded.casita_texto;

  update public.operaciones_memo
  set montaje_hecho = 'hecho'
  where tipo ilike '%arrival%'
    and public.om_casita_num(casita) = v_casita_num
    and public.om_fecha_dia(fecha)   = v_dia
    and public.om_fecha_mes(fecha)   = v_mes;

  return true;
end;
$function$;

create or replace function public.desconfirmar_montaje_manual(p_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_casita text;
  v_fecha  text;
  v_casita_num int;
  v_dia int;
  v_mes int;
  v_tiene_checkin boolean;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' and not private.app_session_valid() then
    raise exception 'Inicia sesión para continuar.' using errcode = '42501';
  end if;

  select casita, fecha into v_casita, v_fecha
  from public.operaciones_memo where id = p_id;
  if not found then return false; end if;

  v_casita_num := public.om_casita_num(v_casita);
  v_dia        := public.om_fecha_dia(v_fecha);
  v_mes        := public.om_fecha_mes(v_fecha);
  if v_casita_num is null or v_dia is null or v_mes is null then
    return false;
  end if;

  delete from public.montajes_manuales
  where casita_num = v_casita_num and dia = v_dia and mes = v_mes;

  v_tiene_checkin := public.montaje_tiene_checkin(v_casita_num, v_dia, v_mes);

  update public.operaciones_memo
  set montaje_hecho = case when v_tiene_checkin then 'hecho' else null end
  where tipo ilike '%arrival%'
    and public.om_casita_num(casita) = v_casita_num
    and public.om_fecha_dia(fecha)   = v_dia
    and public.om_fecha_mes(fecha)   = v_mes;

  return v_tiene_checkin;
end;
$function$;

revoke execute on function public.confirmar_montaje_manual(uuid), public.desconfirmar_montaje_manual(uuid) from public, anon;
grant execute on function public.confirmar_montaje_manual(uuid), public.desconfirmar_montaje_manual(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
