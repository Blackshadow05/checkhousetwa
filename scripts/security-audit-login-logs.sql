-- Read-only audit of persisted data. Mutation statements use WHERE false:
-- permission checks run, but no log is inserted, updated or deleted.
do $audit$
declare
  original_role text := current_user;
  profile record;
  log_total bigint;
  visible bigint;
  session_valid boolean;
  role_allowed boolean;
  denied boolean;
  claim_data jsonb;
  results jsonb := '[]'::jsonb;
  variant text;
  active_profile record;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.login_logs'::regclass) then
    raise exception 'FAIL: login_logs must have RLS enabled';
  end if;

  if has_any_column_privilege('anon', 'public.login_logs', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.login_logs', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.login_logs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.login_logs', 'DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'FAIL: client privileges exceed read-only access';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'login_logs'
      and permissive = 'PERMISSIVE' and cmd <> 'SELECT'
  ) then
    raise exception 'FAIL: a permissive mutation policy exists';
  end if;

  if not has_table_privilege('service_role', 'public.login_logs', 'INSERT') then
    raise exception 'FAIL: automatic login recording must retain INSERT';
  end if;

  select count(*) into log_total from public.login_logs;
  for profile in
    select distinct on (u."Rol") u."Rol" as app_role, u.auth_user_id, u.metodo_login, s.id as session_id
    from public."Usuarios" u
    left join lateral (
      select id from auth.sessions
      where user_id = u.auth_user_id and (not_after is null or not_after > now())
      order by created_at desc limit 1
    ) s on true
    order by u."Rol", (s.id is not null) desc, (u.auth_user_id is not null) desc, u.id
  loop
    claim_data := jsonb_build_object(
      'sub', coalesce(profile.auth_user_id, gen_random_uuid()), 'role', 'authenticated',
      'session_id', coalesce(profile.session_id, gen_random_uuid()), 'aal', 'aal2',
      'amr', jsonb_build_array(jsonb_build_object(
        'method', case when profile.metodo_login = 'google' then 'oauth' else 'password' end,
        'timestamp', extract(epoch from now())::bigint - 60
      )),
      'user_metadata', jsonb_build_object('Rol', 'SuperAdmin'),
      'app_metadata', jsonb_build_object('Rol', 'SuperAdmin')
    );
    perform set_config('request.jwt.claims', claim_data::text, true);
    perform set_config('role', 'authenticated', true);
    select private.app_session_valid() into session_valid;
    select exists (
      select 1 from public."Usuarios"
      where auth_user_id = (select auth.uid()) and "Rol" in ('admin', 'SuperAdmin')
    ) into role_allowed;
    select count(id) into visible from public.login_logs;
    if visible <> (case when session_valid and role_allowed then log_total else 0 end) then
      raise exception 'FAIL: unexpected read access for %', profile.app_role;
    end if;
    if profile.auth_user_id is not null and role_allowed <> (profile.app_role in ('admin', 'SuperAdmin')) then
      raise exception 'FAIL: the stored profile role must determine access';
    end if;

    denied := false;
    begin
      insert into public.login_logs (id, logged_at, usuario, metodo)
        select gen_random_uuid(), now(), 'security-audit', 'password' where false;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: INSERT is available to %', profile.app_role; end if;
    denied := false;
    begin
      update public.login_logs set usuario = usuario where false;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: UPDATE is available to %', profile.app_role; end if;
    denied := false;
    begin
      delete from public.login_logs where false;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL: DELETE is available to %', profile.app_role; end if;

    results := results || jsonb_build_array(jsonb_build_object(
      'role', profile.app_role, 'stored_role_allowed', role_allowed,
      'session_valid', session_valid, 'visible_rows', visible,
      'insert_denied', true, 'update_denied', true, 'delete_denied', true
    ));
    perform set_config('role', original_role, true);
  end loop;

  -- A real existing session lets us verify both a successful read and the
  -- denial of incomplete, expired or fabricated sessions without creating users.
  select u.auth_user_id, u.metodo_login, s.id as session_id into active_profile
  from public."Usuarios" u join auth.sessions s on s.user_id = u.auth_user_id
  where u."Rol" in ('admin', 'SuperAdmin') and (s.not_after is null or s.not_after > now())
    and (u.totp_enrolled or u.metodo_login = 'google')
  order by s.created_at desc limit 1;
  if found then
    foreach variant in array array['valid', 'aal1', 'expired', 'invalid-session'] loop
      claim_data := jsonb_build_object(
        'sub', active_profile.auth_user_id, 'role', 'authenticated',
        'session_id', case when variant = 'invalid-session' then gen_random_uuid() else active_profile.session_id end,
        'aal', case when variant = 'aal1' then 'aal1' else 'aal2' end,
        'amr', jsonb_build_array(jsonb_build_object(
          'method', case when active_profile.metodo_login = 'google' then 'oauth' else 'password' end,
          'timestamp', extract(epoch from now())::bigint - case when variant = 'expired' then 32400 else 60 end
        ))
      );
      perform set_config('request.jwt.claims', claim_data::text, true);
      perform set_config('role', 'authenticated', true);
      select count(id) into visible from public.login_logs;
      if visible <> (case when variant = 'valid' then log_total else 0 end) then
        raise exception 'FAIL: unexpected read access for session %', variant;
      end if;
      results := results || jsonb_build_array(jsonb_build_object('session_case', variant, 'visible_rows', visible));
      perform set_config('role', original_role, true);
    end loop;
  end if;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  denied := false;
  begin
    select count(id) into visible from public.login_logs;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anonymous SELECT is available'; end if;
  perform set_config('role', original_role, true);

  results := results || jsonb_build_array(jsonb_build_object('anonymous_read_denied', true, 'automatic_recording_allowed', true));
  perform set_config('task.login_logs_security_audit', results::text, true);
end;
$audit$;

select current_setting('task.login_logs_security_audit')::jsonb as checks;
