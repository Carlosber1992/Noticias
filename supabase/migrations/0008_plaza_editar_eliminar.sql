alter table public.plaza_news add column edited_at timestamptz;
alter table public.plaza_news_comments add column edited_at timestamptz;
alter table public.plaza_threads add column edited_at timestamptz;
alter table public.plaza_messages add column edited_at timestamptz;
alter table public.plaza_dms add column edited_at timestamptz;
alter table public.plaza_spaces add column edited_at timestamptz;

create function public.plaza_edited() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.plaza_is_suspended(auth.uid()) then raise exception 'Tu cuenta está suspendida'; end if;
 new.edited_at:=now(); return new;
end $$;
revoke execute on function public.plaza_edited() from public,anon,authenticated;
create trigger plaza_edited before update of title,body,municipio,is_breaking,lat,lng,place on public.plaza_news for each row execute function public.plaza_edited();
create trigger plaza_edited before update of body on public.plaza_news_comments for each row execute function public.plaza_edited();
create trigger plaza_edited before update of title,body,lat,lng,place on public.plaza_threads for each row execute function public.plaza_edited();
create trigger plaza_edited before update of body on public.plaza_messages for each row execute function public.plaza_edited();
create trigger plaza_edited before update of body on public.plaza_dms for each row execute function public.plaza_edited();
create trigger plaza_edited before update of name,lat,lng,place on public.plaza_spaces for each row execute function public.plaza_edited();

-- Cada autor solo cambia sus columnas de contenido: nunca votos, anclados ni autor.
revoke update on public.plaza_news,public.plaza_news_comments,public.plaza_threads,public.plaza_messages,public.plaza_dms,public.plaza_spaces,public.plaza_space_details from anon,authenticated;
grant update(title,body,municipio,is_breaking,lat,lng,place) on public.plaza_news to authenticated;
grant update(body) on public.plaza_news_comments to authenticated;
grant update(title,body,lat,lng,place) on public.plaza_threads to authenticated;
grant update(body) on public.plaza_messages to authenticated;
grant update(body) on public.plaza_dms to authenticated;
grant update(name,lat,lng,place) on public.plaza_spaces to authenticated;
grant update(description) on public.plaza_space_details to authenticated;

create policy change on public.plaza_news for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy change on public.plaza_news_comments for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy change on public.plaza_threads for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy change on public.plaza_messages for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy change on public.plaza_dms for update to authenticated using (sender_id=auth.uid()) with check (sender_id=auth.uid());
create policy remove on public.plaza_dms for delete to authenticated using (sender_id=auth.uid());
create policy change on public.plaza_spaces for update to authenticated using (owner_id=auth.uid() and id<>'00000000-0000-0000-0000-00000000f0f0') with check (owner_id=auth.uid());
create policy remove on public.plaza_spaces for delete to authenticated using (owner_id=auth.uid() and id<>'00000000-0000-0000-0000-00000000f0f0');
create policy change on public.plaza_space_details for update to authenticated using (public.plaza_is_owner(space_id) and space_id<>'00000000-0000-0000-0000-00000000f0f0') with check (public.plaza_is_owner(space_id));
create policy plaza_delete on storage.objects for delete to authenticated using (bucket_id='plaza-media' and owner_id=auth.uid()::text);

-- La ubicación vuelve a ser opcional en grupos y canales.
create or replace function public.plaza_create_space(p_type text,p_name text,p_description text,p_private boolean,p_lat double precision,p_lng double precision,p_place text,p_question text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid; me uuid:=auth.uid();
begin
 if me is null then raise exception 'Necesitas una cuenta'; end if;
 if p_type='foro' and coalesce(trim(p_question),'')='' then raise exception 'Escribe la primera pregunta'; end if;
 insert into public.plaza_spaces(type,name,is_private,owner_id,lat,lng,place) values(p_type,trim(p_name),p_private,me,p_lat,p_lng,p_place) returning id into s;
 insert into public.plaza_space_details values(s,coalesce(p_description,''));
 insert into public.plaza_members(space_id,user_id) values(s,me);
 if p_type='foro' then insert into public.plaza_threads(space_id,author_id,title) values(s,me,trim(p_question)) returning id into t; end if;
 return jsonb_build_object('space_id',s,'thread_id',t);
end $$;
