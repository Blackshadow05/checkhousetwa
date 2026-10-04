-- Denial checks only. Never delete real revisions or insert audit entries.
begin;
set local role anon;
do $audit$
begin
  if has_column_privilege(current_user, 'public.registros_eliminados', 'usuario', 'SELECT')
     or has_function_privilege(current_user, 'public.eliminar_revisiones_superadmin(integer,uuid,uuid,uuid,uuid[],inet)', 'EXECUTE') then
    raise exception 'Anonymous privileges are too broad';
  end if;
end;
$audit$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","aal":"aal2"}', true);
do $audit$
begin
  if exists (select 1 from public.registros_eliminados) then
    raise exception 'AAL2 alone must not allow audit reads';
  end if;
  if has_table_privilege(current_user, 'public.registros_eliminados', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege(current_user, 'public.revisiones_casitas', 'DELETE,TRUNCATE')
     or has_function_privilege(current_user, 'public.eliminar_revisiones_superadmin(integer,uuid,uuid,uuid,uuid[],inet)', 'EXECUTE')
     or has_function_privilege(current_user, 'private.eliminar_revisiones_superadmin(integer,uuid,uuid,uuid,uuid[],inet)', 'EXECUTE') then
    raise exception 'Authenticated users must not bypass the server or edit the audit';
  end if;
end;
$audit$;

reset role;
do $audit_roles$
declare
  profile record;
  original_role text := current_user;
  policy_expression text;
  policy_allows boolean;
  session_valid boolean;
  results jsonb := '[]'::jsonb;
begin
  select pg_get_expr(polqual, polrelid) into policy_expression from pg_policy
    where polrelid = 'public.registros_eliminados'::regclass
      and polname = 'registros_eliminados_superadmin_lectura';
  for profile in
    select distinct on (u."Rol") u."Rol" as app_role, u.auth_user_id, u.metodo_login, s.id as session_id
    from public."Usuarios" u
    left join lateral (
      select id from auth.sessions where user_id = u.auth_user_id and (not_after is null or not_after > now())
      order by created_at desc limit 1
    ) s on true
    order by u."Rol", (s.id is not null) desc, (u.auth_user_id is not null) desc, u.id
  loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', coalesce(profile.auth_user_id, gen_random_uuid()), 'role', 'authenticated',
      'session_id', coalesce(profile.session_id, gen_random_uuid()), 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object('method', case when profile.metodo_login = 'google' then 'oauth' else 'password' end,
        'timestamp', extract(epoch from now())::bigint - 60)),
      'user_metadata', jsonb_build_object('Rol', 'SuperAdmin'),
      'app_metadata', jsonb_build_object('Rol', 'SuperAdmin')
    )::text, true);
    perform set_config('role', 'authenticated', true);
    select private.app_session_valid() into session_valid;
    -- Evaluate the actual stored policy, including the live profile lookup.
    execute 'select (' || policy_expression || ')' into policy_allows;
    if policy_allows is distinct from (session_valid and coalesce(profile.app_role = 'SuperAdmin', false)) then
      raise exception 'Unexpected audit access for stored role %', profile.app_role;
    end if;
    results := results || jsonb_build_array(jsonb_build_object('role', profile.app_role,
      'valid_session', session_valid, 'audit_policy_allows', policy_allows));
    perform set_config('role', original_role, true);
  end loop;
  perform set_config('casitas.delete_policy_audit', results::text, true);
end;
$audit_roles$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $audit$
begin
  begin
    perform public.eliminar_revisiones_superadmin(0, '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '{}'::uuid[], null);
    raise exception 'Empty batch must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.eliminar_revisiones_superadmin(0, '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
      array['00000000-0000-0000-0000-000000000004'::uuid], null);
    raise exception 'Missing actor/session must fail';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege(current_user, 'public.registros_eliminados', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'Service role must generate the audit only through the transaction';
  end if;
end;
$audit$;
select jsonb_build_object('success', true, 'anonymous_blocked', true, 'authenticated_mutation_blocked', true,
  'aal2_without_valid_profile_blocked', true, 'invalid_batch_blocked', true, 'missing_actor_blocked', true,
  'role_policy_checks', current_setting('casitas.delete_policy_audit')::jsonb) as verification;
rollback;
