-- Si la cuenta de la sesión ya no existe (por ejemplo, se eliminó desde el panel), las funciones
-- de dirección responden con un mensaje claro en lugar de un error de clave foránea.
create or replace function public.ys_set_handle(p_handle text) returns text language plpgsql security definer set search_path = '' as $$
declare a uuid := auth.uid(); h text := lower(trim(coalesce(p_handle, '')));
begin
  if a is null then raise exception 'Necesitas entrar a tu cuenta'; end if;
  if not exists (select 1 from public.plaza_profiles where id = a) then raise exception 'Tu sesión ya no es válida porque esa cuenta no existe. Vuelve a entrar o crea una cuenta nueva'; end if;
  if public.plaza_is_suspended(a) then raise exception 'Tu cuenta está suspendida'; end if;
  if h !~ '^[a-z0-9_-]{3,30}$' then raise exception 'Usa de 3 a 30 letras sin tildes, números, guion o guion bajo'; end if;
  if public.ys_handle_reserved(h) then raise exception 'Esa dirección está reservada. Elige otra'; end if;
  if exists (select 1 from public.ys_handles where handle = h and uid <> a) then raise exception 'Esa dirección ya está en uso. Elige otra'; end if;
  insert into public.ys_handles(uid, handle) values (a, h)
  on conflict (uid) do update set handle = excluded.handle, updated_at = now();
  begin
    insert into public.plaza_ip_log(user_id, ip, kind, ref, user_agent)
    select a, i, 'direccion', h, public.plaza_request_agent() from (select public.plaza_request_ip() i) x where x.i is not null;
  exception when others then null; end;
  return h;
end $$;

create or replace function public.ys_ensure_handle() returns text language plpgsql security definer set search_path = '' as $$
declare a uuid := auth.uid(); h text;
begin
  if a is null or not exists (select 1 from public.plaza_profiles where id = a) then return null; end if;
  select handle into h from public.ys_handles where uid = a;
  if h is not null then return h; end if;
  h := public.ys_handle_from(a);
  if h is null then return null; end if;
  insert into public.ys_handles(uid, handle) values (a, h) on conflict do nothing;
  return (select handle from public.ys_handles where uid = a);
end $$;
