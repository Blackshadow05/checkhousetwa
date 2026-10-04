set local lock_timeout = '5s';

alter table public."Usuarios" add column if not exists permite_google boolean not null default false;

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
  profile_google boolean;
  app_meta jsonb;
  authenticated_at double precision;
  now_epoch double precision := extract(epoch from now());
  sesion_google boolean;
begin
  if caller_id is null
     or claims ->> 'role' is distinct from 'authenticated'
     or coalesce(claims ->> 'is_anonymous', 'false') = 'true'
     or caller_session is null then
    return false;
  end if;

  select u.metodo_login, coalesce(u.totp_enrolled, false), coalesce(u.permite_google, false)
    into profile_method, profile_totp, profile_google
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

  sesion_google := exists (
    select 1 from jsonb_array_elements(claims -> 'amr') entry
    where entry ->> 'method' = 'oauth'
  );

  if sesion_google then
    return (profile_method = 'google' or profile_google)
      and (
        coalesce(app_meta ->> 'provider' = 'google', false)
        or coalesce(app_meta -> 'providers', '[]'::jsonb) ? 'google'
      )
      and coalesce(claims ->> 'aal' = 'aal2', false);
  end if;

  if profile_method = 'google' then
    return false;
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

notify pgrst, 'reload schema';
