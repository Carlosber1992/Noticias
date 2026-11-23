-- Dirección propia y única de cada persona: yasupo.com/<direccion> abre su canal (o su perfil).
-- Solo letras minúsculas, números, guion y guion bajo (3 a 30), sin palabras reservadas.
create table public.ys_handles (
  uid uuid primary key references public.plaza_profiles(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_-]{3,30}$'),
  updated_at timestamptz not null default now()
);
alter table public.ys_handles enable row level security;
create policy ys_handles_read on public.ys_handles for select using (true);
grant select on public.ys_handles to anon, authenticated;
alter publication supabase_realtime add table public.ys_handles;

create or replace function public.ys_handle_reserved(h text) returns boolean language sql immutable set search_path = '' as $$
  select h = any (array['admin','administrador','panel','api','yasupo','ayuda','soporte','contacto','cuenta','mi-cuenta','micuenta',
    'login','entrar','salir','registro','registrarse','buscar','busqueda','publicar','noticias','noticia','canal','canales','perfil','perfiles',
    'configuracion','ajustes','privacidad','terminos','condiciones','legal','seguridad','moderador','moderacion','staff','equipo',
    'index','assets','static','public','www','app','apps','root','system','sistema','null','undefined','inicio','home','feed',
    'explorar','siguiendo','guardados','temas','categorias','comunidad','eventos','mensajes','chat','notificaciones','alertas',
    'oficial','yasupo_oficial','soporte_yasupo'])
$$;

/** Elige (o cambia) la dirección de quien está conectado. Devuelve la dirección guardada. */
create or replace function public.ys_set_handle(p_handle text) returns text language plpgsql security definer set search_path = '' as $$
declare a uuid := auth.uid(); h text := lower(trim(coalesce(p_handle, '')));
begin
  if a is null then raise exception 'Necesitas entrar a tu cuenta'; end if;
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

/** Dirección a partir del usuario (sin puntos ni símbolos), con un número si ya está ocupada. */
create or replace function public.ys_handle_from(p_uid uuid) returns text language plpgsql security definer set search_path = '' as $$
declare base text; h text; n int := 1;
begin
  select left(regexp_replace(lower(username), '[^a-z0-9_-]', '_', 'g'), 26) into base from public.plaza_profiles where id = p_uid;
  if base is null then return null; end if;
  if char_length(base) < 3 then base := rpad(base, 3, '_'); end if;
  h := base;
  while public.ys_handle_reserved(h) or exists (select 1 from public.ys_handles where handle = h and uid <> p_uid) loop
    n := n + 1; h := base || n;
  end loop;
  return h;
end $$;

/** Al entrar: si la persona aún no tiene dirección, se le asigna la de su usuario. */
create or replace function public.ys_ensure_handle() returns text language plpgsql security definer set search_path = '' as $$
declare a uuid := auth.uid(); h text;
begin
  if a is null then return null; end if;
  select handle into h from public.ys_handles where uid = a;
  if h is not null then return h; end if;
  h := public.ys_handle_from(a);
  if h is null then return null; end if;
  insert into public.ys_handles(uid, handle) values (a, h) on conflict do nothing;
  return (select handle from public.ys_handles where uid = a);
end $$;

revoke execute on function public.ys_set_handle(text), public.ys_ensure_handle(), public.ys_handle_from(uuid) from public, anon;
grant execute on function public.ys_set_handle(text), public.ys_ensure_handle() to authenticated;
revoke execute on function public.ys_handle_from(uuid) from authenticated;

-- Direcciones para quienes ya tienen perfil en el nuevo diseño.
do $$
declare r record;
begin
  for r in select d.uid from public.ys_docs d join public.plaza_profiles p on p.id = d.uid where d.col = 'accounts' order by p.created_at loop
    insert into public.ys_handles(uid, handle) values (r.uid, public.ys_handle_from(r.uid)) on conflict do nothing;
  end loop;
end $$;
