set local lock_timeout = '5s';

create table public.registros_eliminados (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  usuario_id integer not null,
  usuario text not null,
  ip inet,
  cantidad integer not null check (cantidad between 1 and 200),
  revision_ids uuid[] not null,
  challenge_id uuid not null unique,
  constraint registros_eliminados_cantidad_ids check (cardinality(revision_ids) = cantidad)
);
comment on table public.registros_eliminados is 'Auditoría inmutable de eliminaciones confirmadas con un nuevo código TOTP. No almacena los contenidos borrados.';
create index registros_eliminados_fecha_id_idx on public.registros_eliminados (fecha desc, id desc);
create index revisiones_casitas_created_id_idx on public.revisiones_casitas (created_at desc nulls last, id desc);

alter table public.registros_eliminados enable row level security;
alter table public.registros_eliminados force row level security;
revoke all on public.registros_eliminados from public, anon, authenticated, service_role;
grant select (id, fecha, usuario_id, usuario, ip, cantidad) on public.registros_eliminados to authenticated, service_role;

create policy registros_eliminados_superadmin_lectura
  on public.registros_eliminados for select to authenticated
  using (
    (select private.app_session_valid())
    and (select exists (
      select 1 from public."Usuarios" u
      where u.auth_user_id = (select auth.uid()) and u."Rol" = 'SuperAdmin'
    ))
  );
create policy registros_eliminados_sin_escritura on public.registros_eliminados
  as restrictive for all to anon using (false) with check (false);
-- No client INSERT / UPDATE / DELETE policy or privilege exists. Even SuperAdmin
-- can only read; the private transaction generates every audit entry itself.

create function private.registros_eliminados_inmutables()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception 'El historial de eliminaciones es inmutable.' using errcode = '42501';
end;
$function$;
revoke all on function private.registros_eliminados_inmutables() from public, anon, authenticated, service_role;
create trigger registros_eliminados_inmutables
  before update or delete or truncate on public.registros_eliminados
  for each statement execute function private.registros_eliminados_inmutables();

-- Existing permissive ALL policies must not provide a direct DELETE bypass.
revoke delete, truncate on public.revisiones_casitas from public, anon, authenticated;
create policy revisiones_eliminacion_solo_servidor on public.revisiones_casitas
  as restrictive for delete to anon, authenticated using (false);

-- Auth's internal tables are not readable by service_role. A private definer is
-- necessary to validate the server-verified MFA challenge and live auth session.
-- It is never exposed to clients. The public wrapper is SECURITY INVOKER and
-- only service_role can execute it. No user-supplied JWT metadata is trusted.
create function private.eliminar_revisiones_superadmin(
  p_actor_id integer, p_auth_user_id uuid, p_session_id uuid,
  p_challenge_id uuid, p_ids uuid[], p_ip inet
)
returns table (id uuid, fecha timestamptz, usuario_id integer, usuario text, ip inet, cantidad integer)
language plpgsql security definer set search_path = '' as $function$
declare
  actor_name text;
  requested_count integer := cardinality(p_ids);
  locked_ids uuid[];
  deleted_count integer;
  audit_id uuid;
  audit_date timestamptz;
begin
  if auth.jwt() ->> 'role' is distinct from 'service_role' or auth.uid() is not null then
    raise exception 'Solo el servidor puede ejecutar esta operación.' using errcode = '42501';
  end if;
  if requested_count is null or requested_count < 1 or requested_count > 200
     or array_ndims(p_ids) <> 1 or array_position(p_ids, null) is not null
     or (select count(distinct x) from unnest(p_ids) x) <> requested_count then
    raise exception 'La selección debe contener de 1 a 200 revisiones distintas.' using errcode = '22023';
  end if;

  -- Lock the stored profile so a concurrent demotion cannot authorize this delete.
  select u."Usuario" into actor_name from public."Usuarios" u
    where u.id = p_actor_id and u.auth_user_id = p_auth_user_id and u."Rol" = 'SuperAdmin'
    for share;
  if not found or not exists (
    select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = p_auth_user_id and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and s.id = p_session_id and s.aal = 'aal2'
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'Se requiere una sesión vigente de SuperAdmin.' using errcode = '42501';
  end if;

  -- Bind a fresh, successfully verified TOTP challenge to this exact user.
  -- Locking it and the UNIQUE audit column prevent reuse/concurrent replay.
  perform c.id from auth.mfa_challenges c join auth.mfa_factors f on f.id = c.factor_id
    where c.id = p_challenge_id and f.user_id = p_auth_user_id
      and f.factor_type = 'totp' and f.status = 'verified'
      and c.created_at >= now() - interval '60 seconds'
      and c.verified_at >= now() - interval '60 seconds' and c.verified_at <= now()
    for update of c;
  if not found or exists (select 1 from public.registros_eliminados a where a.challenge_id = p_challenge_id) then
    raise exception 'Se requiere un código nuevo de Authenticator.' using errcode = '42501';
  end if;

  -- Stable lock order prevents overlapping batches from deadlocking. All
  -- requested rows must still exist; missing IDs abort the entire operation.
  select array_agg(r.id) into locked_ids from (
    select r.id from public.revisiones_casitas r where r.id = any(p_ids)
    order by r.id for update
  ) r;
  if coalesce(cardinality(locked_ids), 0) <> requested_count then
    raise exception 'La selección contiene revisiones que ya no existen.' using errcode = 'P0002';
  end if;
  delete from public.revisiones_casitas r where r.id = any(locked_ids);
  get diagnostics deleted_count = row_count;
  if deleted_count <> requested_count then
    raise exception 'No se pudo eliminar toda la selección.' using errcode = 'P0002';
  end if;
  -- notas_revisiones_casitas follows the existing ON DELETE CASCADE FK.
  insert into public.registros_eliminados (usuario_id, usuario, ip, cantidad, revision_ids, challenge_id)
    values (p_actor_id, actor_name, p_ip, deleted_count, locked_ids, p_challenge_id)
    returning registros_eliminados.id, registros_eliminados.fecha into audit_id, audit_date;
  return query select audit_id, audit_date, p_actor_id, actor_name, p_ip, deleted_count;
end;
$function$;
revoke all on function private.eliminar_revisiones_superadmin(integer, uuid, uuid, uuid, uuid[], inet) from public, anon, authenticated;
grant execute on function private.eliminar_revisiones_superadmin(integer, uuid, uuid, uuid, uuid[], inet) to service_role;

create function public.eliminar_revisiones_superadmin(
  p_actor_id integer, p_auth_user_id uuid, p_session_id uuid,
  p_challenge_id uuid, p_ids uuid[], p_ip inet
)
returns table (id uuid, fecha timestamptz, usuario_id integer, usuario text, ip inet, cantidad integer)
language sql security invoker set search_path = '' as $function$
  select * from private.eliminar_revisiones_superadmin(p_actor_id, p_auth_user_id, p_session_id, p_challenge_id, p_ids, p_ip);
$function$;
revoke all on function public.eliminar_revisiones_superadmin(integer, uuid, uuid, uuid, uuid[], inet) from public, anon, authenticated;
grant execute on function public.eliminar_revisiones_superadmin(integer, uuid, uuid, uuid, uuid[], inet) to service_role;
notify pgrst, 'reload schema';
