set local lock_timeout = '5s';

alter table public.login_logs enable row level security;

-- Remove table and column grants so authenticated users can never write logs.
-- Keep the service_role grants used by the server's automatic login recorder.
revoke all on table public.login_logs from public, anon, authenticated;

do $migration$
declare
  existing record;
begin
  for existing in
    select attname from pg_attribute
    where attrelid = 'public.login_logs'::regclass
      and attnum > 0 and not attisdropped
  loop
    execute format('revoke all (%I) on table public.login_logs from public, anon, authenticated', existing.attname);
  end loop;

  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'login_logs'
  loop
    execute format('drop policy %I on public.login_logs', existing.policyname);
  end loop;
end;
$migration$;

-- Expose only the fields displayed in the access history.
grant select (id, logged_at, usuario, ip_address, metodo)
  on public.login_logs to authenticated;

create policy deny_anonymous_access on public.login_logs
  as restrictive for all to anon using (false) with check (false);

-- Usuarios has its own profile-only SELECT policy and cannot be edited by
-- authenticated clients. Read the current stored role, never user_metadata.
create policy lectura_admin_superadmin on public.login_logs
  for select to authenticated
  using (
    (select private.app_session_valid())
    and (select exists (
      select 1 from public."Usuarios" u
      where u.auth_user_id = (select auth.uid())
        and u."Rol" in ('admin', 'SuperAdmin')
    ))
  );

-- No INSERT, UPDATE or DELETE policy exists for clients (default deny).
notify pgrst, 'reload schema';
