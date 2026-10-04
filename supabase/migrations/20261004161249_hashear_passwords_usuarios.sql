set local lock_timeout = '5s';

create or replace function private.hashear_password_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(new.password_hash, '') <> ''
     and new.password_hash !~ '^\$2[abxy]?\$[0-9]{2}\$' then
    new.password_hash := extensions.crypt(new.password_hash, extensions.gen_salt('bf', 10));
  end if;
  return new;
end;
$function$;

revoke all on function private.hashear_password_usuario() from public, anon, authenticated;

drop trigger if exists trg_usuarios_hashear_password on public."Usuarios";
create trigger trg_usuarios_hashear_password
  before insert or update of password_hash on public."Usuarios"
  for each row execute function private.hashear_password_usuario();

update public."Usuarios"
  set password_hash = password_hash
  where coalesce(password_hash, '') <> ''
    and password_hash !~ '^\$2[abxy]?\$[0-9]{2}\$';
