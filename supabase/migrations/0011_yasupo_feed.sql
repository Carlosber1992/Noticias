-- Nuevo diseño de Yasupo (feed de canales). Cada persona tiene un documento por
-- colección (perfil, canal, publicaciones, comentarios); todos pueden leerlos y
-- solo su dueño (o un moderador) puede cambiarlos. Los guardados son privados.

create table public.ys_mods (uid uuid primary key references auth.users on delete cascade);
alter table public.ys_mods enable row level security;

create or replace function public.ys_is_mod() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.ys_mods where uid = auth.uid()) $$;
grant execute on function public.ys_is_mod() to anon, authenticated;

create table public.ys_docs (
  col text not null check (col in ('accounts','channels','posts','comments')),
  uid uuid not null references auth.users on delete cascade,
  data jsonb not null check (octet_length(data::text) <= 300000),
  updated_at timestamptz not null default now(),
  primary key (col, uid)
);
alter table public.ys_docs enable row level security;
create policy ys_docs_read on public.ys_docs for select using (true);
create policy ys_docs_insert on public.ys_docs for insert to authenticated
  with check (uid = auth.uid() and (col = 'accounts' or exists (select 1 from public.ys_docs a where a.col = 'accounts' and a.uid = auth.uid())));
create policy ys_docs_update on public.ys_docs for update to authenticated
  using (uid = auth.uid() or (public.ys_is_mod() and col in ('posts','comments')))
  with check (uid = auth.uid() or (public.ys_is_mod() and col in ('posts','comments')));
create policy ys_docs_delete on public.ys_docs for delete to authenticated using (uid = auth.uid());
grant select on public.ys_docs to anon, authenticated;
grant insert, update, delete on public.ys_docs to authenticated;

create or replace function public.ys_touch() returns trigger language plpgsql set search_path = public as
$$ begin new.updated_at := now(); return new; end $$;
create trigger ys_touch before update on public.ys_docs for each row execute function public.ys_touch();

create table public.ys_saved (
  uid uuid primary key references auth.users on delete cascade default auth.uid(),
  ids jsonb not null default '[]' check (jsonb_typeof(ids) = 'array' and jsonb_array_length(ids) <= 2000)
);
alter table public.ys_saved enable row level security;
create policy ys_saved_own on public.ys_saved for all to authenticated using (uid = auth.uid()) with check (uid = auth.uid());
grant select, insert, update, delete on public.ys_saved to authenticated;

alter table public.ys_docs replica identity full;
alter publication supabase_realtime add table public.ys_docs;

-- Fotos y vídeos de las publicaciones: lectura pública, cada persona escribe en su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yasupo-media', 'yasupo-media', true, 20971520,
        array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'])
on conflict (id) do nothing;
create policy ys_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'yasupo-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy ys_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'yasupo-media' and owner_id = auth.uid()::text);
