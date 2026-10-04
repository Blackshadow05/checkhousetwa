set local lock_timeout = '5s';

-- A Supabase token alone is not a completed application login. Require a
-- linked, active profile, a live session, and OAuth or completed MFA (< 8 h).
-- Legacy signed-cookie sessions use the validated server-only service client.
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
  caller_user_id uuid := auth.uid();
  caller_session_id text := claims ->> 'session_id';
  login_method text;
  authenticated_at double precision;
  current_epoch double precision := extract(epoch from now());
begin
  if caller_user_id is null or claims ->> 'role' is distinct from 'authenticated'
     or claims ->> 'is_anonymous' = 'true'
     or caller_session_id is null then
    return false;
  end if;

  select u.metodo_login into login_method
    from public."Usuarios" u
    where u.auth_user_id = caller_user_id and u."Rol" is distinct from 'inactivo';
  if not found then return false; end if;

  if not exists (
    select 1 from auth.sessions s
    where s.id = caller_session_id::uuid and s.user_id = caller_user_id
      and (s.not_after is null or s.not_after > now())
  ) then return false; end if;

  if jsonb_typeof(claims -> 'amr') is distinct from 'array' then
    return false;
  end if;
  select min((entry ->> 'timestamp')::double precision)
    into authenticated_at
    from jsonb_array_elements(claims -> 'amr') entry
    where jsonb_typeof(entry -> 'timestamp') = 'number';
  if authenticated_at is null or authenticated_at > current_epoch + 60
     or authenticated_at <= current_epoch - 28800 then
    return false;
  end if;

  if login_method = 'google' then
    return (
      coalesce(claims #>> '{app_metadata,provider}' = 'google', false)
      or coalesce(claims #> '{app_metadata,providers}', '[]'::jsonb) ? 'google'
    ) and exists (
      select 1 from jsonb_array_elements(claims -> 'amr') entry
      where entry ->> 'method' = 'oauth'
    );
  end if;
  return coalesce(claims ->> 'aal' = 'aal2', false);
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$function$;

revoke all on function private.app_session_valid() from public, anon;
grant execute on function private.app_session_valid() to authenticated, service_role;
comment on function private.app_session_valid() is
  'Checks only the caller session against the protected application profile and live Auth session. Never trusts user_metadata.';

do $migration$
declare
  target record;
  existing_policy record;
begin
  for target in
    select c.relname, has_table_privilege('authenticated', c.oid, 'SELECT') as allowed_read
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('menus', 'consejos_diarios')
  loop
    execute format('alter table public.%I enable row level security', target.relname);
    execute format('revoke all on table public.%I from public, anon, authenticated', target.relname);
    -- Column grants are independent from table grants.
    for existing_policy in
      select a.attname from pg_attribute a
      where a.attrelid = format('public.%I', target.relname)::regclass
        and a.attnum > 0 and not a.attisdropped
    loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated', existing_policy.attname, target.relname);
    end loop;
    execute format('drop policy if exists deny_anonymous_access on public.%I', target.relname);
    execute format('create policy deny_anonymous_access on public.%I as restrictive for all to anon using (false) with check (false)', target.relname);
    execute format('create policy require_app_session on public.%I as restrictive for all to authenticated using ((select private.app_session_valid())) with check ((select private.app_session_valid()))', target.relname);
    if target.allowed_read and target.relname not in ('Usuarios', 'login_logs') then
      execute format('grant select on table public.%I to authenticated', target.relname);
    end if;
  end loop;

  -- Replace old public/anon allow policies on the six requested tables.
  for target in
    select unnest(array['revisiones_casitas', 'reporte_pantallas',
      'notas_revisiones_casitas', 'inventario_pantallas', 'horarios',
      'operaciones_memo']) as relname
  loop
    for existing_policy in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target.relname
        and permissive = 'PERMISSIVE'
        and roles && array['public', 'anon', 'authenticated']::name[]
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, target.relname);
    end loop;
    execute format('create policy app_session_select on public.%I for select to authenticated using (true)', target.relname);
    -- Client reads support Realtime. Application writes use createPrivateClient
    -- after a server-side session check; no direct client mutation is needed.
    execute format('revoke all on table public.%I from authenticated', target.relname);
    execute format('grant select on table public.%I to authenticated', target.relname);
  end loop;

  -- Credentials, roles, reset tokens and access logs are server-only.
  for target in select unnest(array['Usuarios', 'login_logs']) as relname
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', target.relname);
    for existing_policy in
      select a.attname from pg_attribute a
      where a.attrelid = format('public.%I', target.relname)::regclass
        and a.attnum > 0 and not a.attisdropped
    loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated', existing_policy.attname, target.relname);
    end loop;
    execute format('create policy server_only_access on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', target.relname);
  end loop;

  -- Fixed lookup paths prevent resolution through caller-controlled schemas.
  for target in
    select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = pg_catalog, public, pg_temp', target.signature);
    execute format('revoke execute on function %s from public, anon, authenticated', target.signature);
    execute format('grant execute on function %s to service_role', target.signature);
  end loop;
  -- Existing privileged helpers are used by backend jobs/triggers, not clients.
  for target in
    select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  loop
    execute format('revoke execute on function %s from authenticated', target.signature);
    execute format('grant execute on function %s to service_role', target.signature);
  end loop;
end;
$migration$;

alter view public.vista_ultimas_revisiones set (security_invoker = true);
alter view public.revisiones_casitas_completa set (security_invoker = true);
revoke all on public.vista_ultimas_revisiones, public.revisiones_casitas_completa from public, anon, authenticated;
grant select on public.vista_ultimas_revisiones, public.revisiones_casitas_completa to authenticated;

-- The public home reads these catalogs; only the backend maintains them.
revoke all on public.menus, public.consejos_diarios from public, anon, authenticated;
grant select on public.menus, public.consejos_diarios to anon, authenticated;

-- Do not change existing public download URLs. Block anonymous listing/writes
-- and require a completed application session for client Storage operations.
create policy deny_anonymous_app_storage on storage.objects
  as restrictive for all to anon using (false) with check (false);
create policy require_app_session_storage on storage.objects
  as restrictive for all to authenticated
  using ((select private.app_session_valid()))
  with check ((select private.app_session_valid()));

-- Keep newly created application objects closed until explicitly granted.
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
