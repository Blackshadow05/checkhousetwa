set local lock_timeout = '5s';

create table if not exists private.intentos_login (
  id bigint generated always as identity primary key,
  usuario text not null,
  ip text,
  creado_at timestamptz not null default now()
);

create index if not exists intentos_login_usuario_idx on private.intentos_login (lower(usuario), creado_at);
create index if not exists intentos_login_ip_idx on private.intentos_login (ip, creado_at);

alter table private.intentos_login enable row level security;
revoke all on table private.intentos_login from public, anon, authenticated;

create or replace function public.verificar_credenciales_usuario(
  p_usuario text,
  p_password text,
  p_ip text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  nombre text := btrim(coalesce(p_usuario, ''));
  origen text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
  perfil record;
  fallos_usuario integer;
  fallos_ip integer := 0;
begin
  if nombre = '' or coalesce(p_password, '') = ''
     or length(nombre) > 160 or length(p_password) > 512 then
    return jsonb_build_object('estado', 'invalido');
  end if;

  delete from private.intentos_login where creado_at < now() - interval '1 day';

  select count(*) into fallos_usuario
    from private.intentos_login
    where lower(usuario) = lower(nombre) and creado_at > now() - interval '15 minutes';
  if origen is not null then
    select count(*) into fallos_ip
      from private.intentos_login
      where ip = origen and creado_at > now() - interval '15 minutes';
  end if;
  if fallos_usuario >= 8 or fallos_ip >= 30 then
    return jsonb_build_object('estado', 'bloqueado');
  end if;

  select u.id, u."Usuario", u."Rol", u.metodo_login, u.email, u.auth_user_id, u.totp_enrolled
    into perfil
    from public."Usuarios" u
    where u."Usuario" = nombre
      and coalesce(u.password_hash, '') <> ''
      and case
        when u.password_hash ~ '^\$2[abxy]?\$[0-9]{2}\$'
          then u.password_hash = extensions.crypt(p_password, u.password_hash)
        else u.password_hash = p_password
      end
    limit 1;

  if not found then
    insert into private.intentos_login (usuario, ip) values (left(nombre, 160), origen);
    return jsonb_build_object('estado', 'invalido');
  end if;

  delete from private.intentos_login where lower(usuario) = lower(nombre);

  return jsonb_build_object(
    'estado', 'ok',
    'perfil', jsonb_build_object(
      'id', perfil.id,
      'Usuario', perfil."Usuario",
      'Rol', perfil."Rol",
      'metodo_login', perfil.metodo_login,
      'email', perfil.email,
      'auth_user_id', perfil.auth_user_id,
      'totp_enrolled', coalesce(perfil.totp_enrolled, false)
    )
  );
end;
$function$;

revoke all on function public.verificar_credenciales_usuario(text, text, text) from public, anon, authenticated;
grant execute on function public.verificar_credenciales_usuario(text, text, text) to service_role;

notify pgrst, 'reload schema';
