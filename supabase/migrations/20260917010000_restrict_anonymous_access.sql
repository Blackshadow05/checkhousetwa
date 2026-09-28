revoke all privileges on all tables in schema public from anon, public;
revoke all privileges on all sequences in schema public from anon, public;
revoke execute on all functions in schema public from anon, public;
grant select on table public.menus to anon;

alter default privileges for role postgres in schema public revoke all on tables from anon, public;
alter default privileges for role postgres in schema public revoke all on sequences from anon, public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

do $migration$
declare
  target record;
begin
  for target in
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'menus'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);
    execute format('create policy deny_anonymous_access on public.%I as restrictive for all to anon using (false) with check (false)', target.tablename);
  end loop;
end;
$migration$;
