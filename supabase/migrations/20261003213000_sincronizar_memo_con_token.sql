set local lock_timeout = '5s';

create table private.memo_sync_credencial (
  id smallint primary key default 1 check (id = 1),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  rotado_at timestamptz not null default now()
);
alter table private.memo_sync_credencial enable row level security;
revoke all on private.memo_sync_credencial from public, anon, authenticated, service_role;

create function public.sincronizar_operaciones_memo_hoja(
  p_token text, p_filas jsonb, p_fechas date[], p_simular boolean default false
)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_hash text;
begin
  select c.token_hash into v_hash from private.memo_sync_credencial c where c.id = 1;
  if p_token is null or v_hash is null
     or encode(extensions.digest(p_token, 'sha256'), 'hex') <> v_hash then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 2000 then
    raise exception 'Filas no válidas.' using errcode = '22023';
  end if;
  return public.sincronizar_operaciones_memo(
    p_filas,
    array(select f from unnest(p_fechas) f where f between v_hoy - 1 and v_hoy + 1),
    v_hoy - 1,
    v_hoy + 1,
    coalesce(p_simular, false)
  );
end;
$function$;

revoke all on function public.sincronizar_operaciones_memo_hoja(text, jsonb, date[], boolean) from public, anon, authenticated;
grant execute on function public.sincronizar_operaciones_memo_hoja(text, jsonb, date[], boolean) to anon;
notify pgrst, 'reload schema';
