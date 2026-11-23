-- Conecta el feed nuevo de Yasupo (ys_docs) con el panel de administración:
-- IP y suspensión al publicar, anclados del feed, y publicaciones, comentarios y canales
-- del feed dentro de plaza_items para buscar, borrar y exportar.

-- 1. La IP puede apuntar a contenido con id de texto (las publicaciones del feed no usan uuid).
alter table public.plaza_ip_log add column ref text;
update public.plaza_ip_log set ref=ref_id::text where ref_id is not null;
create index on public.plaza_ip_log(ref);
create or replace function public.plaza_log_ip() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=tg_argv[0]; a uuid:=auth.uid(); i text; r text;
begin
 begin
  i:=public.plaza_request_ip();
  if a is not null and i is not null then
   if k='mensaje' and to_jsonb(new)->>'thread_id' is not null then k:='respuesta'; end if;
   r:=to_jsonb(new)->>'id';
   insert into public.plaza_ip_log(user_id,ip,kind,ref_id,ref,user_agent) values(a,i,k,r::uuid,r,public.plaza_request_agent());
  end if;
 exception when others then null; end;
 return null;
end $$;

-- 2. Anclados del feed: lectura pública para que la web los ponga en su puesto.
create table public.ys_pins(
  item_id text primary key,
  kind text not null check (kind in ('post','channel')),
  rank int not null check (rank between 1 and 50),
  unique(kind,rank));
alter table public.ys_pins enable row level security;
create policy ys_pins_read on public.ys_pins for select using (true);
grant select on public.ys_pins to anon,authenticated;
alter publication supabase_realtime add table public.ys_pins;

-- 3. Una cuenta suspendida no puede escribir en el feed.
create function public.ys_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.plaza_is_suspended(auth.uid()) then raise exception 'Tu cuenta está suspendida'; end if;
 return new;
end $$;
create trigger ys_guard before insert or update on public.ys_docs for each row execute function public.ys_guard();

-- 4. IP de cada publicación, comentario, canal, edición y registro en el feed.
create function public.ys_log_ip() returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); i text; ua text; o jsonb:='[]'; x jsonb; y jsonb; p text;
begin
 begin
  if a is null or a<>new.uid then return null; end if;
  i:=public.plaza_request_ip(); if i is null then return null; end if;
  ua:=public.plaza_request_agent();
  if new.col in ('posts','comments') then
   if tg_op='UPDATE' and jsonb_typeof(old.data->'items')='array' then o:=old.data->'items'; end if;
   p:=case new.col when 'posts' then 'p_' else 'c_' end;
   if jsonb_typeof(new.data->'items')='array' then
    for x in select e from jsonb_array_elements(new.data->'items') e loop
     y:=null;
     select e into y from jsonb_array_elements(o) e where e->>'id'=x->>'id' limit 1;
     if y is null then
      insert into public.plaza_ip_log(user_id,ip,kind,ref,user_agent) values(a,i,case new.col when 'posts' then 'publicacion' else 'comentario_feed' end,p||(x->>'id'),ua);
     elsif new.col='posts' and y is distinct from x then
      insert into public.plaza_ip_log(user_id,ip,kind,ref,user_agent) values(a,i,'edicion',p||(x->>'id'),ua);
     end if;
    end loop;
   end if;
  elsif new.col='channels' and (tg_op='INSERT' or old.data is distinct from new.data) then
   insert into public.plaza_ip_log(user_id,ip,kind,ref,user_agent) values(a,i,case when tg_op='INSERT' then 'canal_feed' else 'edicion' end,'ch_'||a,ua);
  elsif new.col='accounts' and tg_op='INSERT' then
   insert into public.plaza_ip_log(user_id,ip,kind,user_agent) values(a,i,'registro',ua);
  end if;
 exception when others then null; end;
 return null;
end $$;
create trigger ys_ip after insert or update on public.ys_docs for each row execute function public.ys_log_ip();
revoke execute on function public.ys_guard(),public.ys_log_ip() from public,anon,authenticated;

-- 5. Todo el contenido en una lista, ahora con el feed. El id pasa a ser texto.
create function public.ys_ts(v text,fallback timestamptz) returns timestamptz language sql immutable set search_path='' as
$$ select case when v ~ '^\d{10,14}$' then to_timestamp(v::numeric/1000) else fallback end $$;
create function public.ys_media(m jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce((select jsonb_agg(jsonb_build_object('bucket','yasupo-media','path',split_part(e->>'id','_',1)||'/'||substr(e->>'id',strpos(e->>'id','_')+1),
   'k',case e->>'kind' when 'image' then 'photo' else e->>'kind' end,'name',e->>'id'))
  from jsonb_array_elements(case when jsonb_typeof(m)='array' then m else '[]' end) e where strpos(coalesce(e->>'id',''),'_')>0),'[]')
$$;
drop function public.plaza_items();
create function public.plaza_items() returns table(kind text,id text,author_id uuid,title text,body text,municipio text,space_id uuid,space_name text,is_private boolean,is_breaking boolean,media jsonb,up int,down int,pin_rank int,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 with acc as (select d.data from public.ys_docs d where d.col='accounts'),
 reac as (select l.v id,sum(l.up)::int up,sum(l.down)::int down from (
   select jsonb_array_elements_text(case when jsonb_typeof(a.data->'likes')='array' then a.data->'likes' else '[]' end) v,1 up,0 down from acc a
   union all select jsonb_array_elements_text(case when jsonb_typeof(a.data->'dislikes')='array' then a.data->'dislikes' else '[]' end),0,1 from acc a) l group by l.v),
 posts as (select d.uid,d.updated_at,e from public.ys_docs d,jsonb_array_elements(case when jsonb_typeof(d.data->'items')='array' then d.data->'items' else '[]' end) e where d.col='posts'),
 chans as (select d.uid,d.data from public.ys_docs d where d.col='channels')
 select 'noticia',n.id::text,n.author_id,n.title,n.body,n.municipio,null::uuid,null::text,false,n.is_breaking,n.media,n.up_count,n.down_count,n.pin_rank,n.created_at from public.plaza_news n
 union all select 'comentario',c.id::text,c.author_id,left(x.title,120),c.body,x.municipio,null,null,false,false,c.media,0,0,null,c.created_at from public.plaza_news_comments c join public.plaza_news x on x.id=c.news_id
 union all select 'pregunta',t.id::text,t.author_id,t.title,t.body,s.place,s.id,s.name,s.is_private,false,'[]'::jsonb,t.vote_count,0,null,t.created_at from public.plaza_threads t join public.plaza_spaces s on s.id=t.space_id
 union all select case when m.thread_id is null then 'mensaje' else 'respuesta' end,m.id::text,m.author_id,'',m.body,m.place,s.id,s.name,s.is_private,false,m.media,m.like_count,0,null,m.created_at from public.plaza_messages m join public.plaza_spaces s on s.id=m.space_id
 union all select s.type,s.id::text,s.owner_id,s.name,coalesce(d.description,''),s.place,s.id,s.name,s.is_private,false,'[]'::jsonb,0,0,s.pin_rank,s.created_at from public.plaza_spaces s left join public.plaza_space_details d on d.space_id=s.id
 union all select 'publicacion','p_'||(p.e->>'id'),p.uid,left(coalesce(p.e->>'title',''),200),coalesce(p.e->>'body',''),coalesce(nullif(p.e->'geo'->>'place',''),p.e->'geo'->>'city'),null,c.data->>'name',false,false,public.ys_media(p.e->'media'),coalesce(r.up,0),coalesce(r.down,0),pn.rank,public.ys_ts(p.e->>'at',p.updated_at)
  from posts p left join chans c on c.uid=p.uid left join reac r on r.id='p_'||(p.e->>'id') left join public.ys_pins pn on pn.item_id='p_'||(p.e->>'id')
 union all select 'comentario_feed','c_'||(ce.v->>'id'),d.uid,coalesce(left(t.e->>'title',120),ce.v->>'itemId'),coalesce(ce.v->>'text',''),null,null,null,false,false,'[]'::jsonb,0,0,null,public.ys_ts(ce.v->>'at',d.updated_at)
  from public.ys_docs d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data->'items')='array' then d.data->'items' else '[]' end) ce(v) left join posts t on 'p_'||(t.e->>'id')=ce.v->>'itemId' where d.col='comments'
 union all select 'canal_feed','ch_'||c.uid,c.uid,coalesce(c.data->>'name',''),coalesce(c.data->>'about',''),null,null,c.data->>'name',false,false,'[]'::jsonb,0,0,pn.rank,public.ys_ts(c.data->>'createdAt',now())
  from chans c left join public.ys_pins pn on pn.item_id='ch_'||c.uid
$$;
revoke execute on function public.plaza_items(),public.ys_ts(text,timestamptz),public.ys_media(jsonb) from public,anon,authenticated;

-- 6. Borrar contenido del feed y del resto, con id de texto.
drop function public.plaza_admin_delete(text,uuid,text);
create function public.plaza_admin_delete(p_kind text,p_id text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare i record; me text:=public.plaza_need('admin');
begin
 select * into i from public.plaza_items() x where x.id=p_id and x.kind=p_kind;
 if not found then raise exception 'Ese contenido ya no existe'; end if;
 if p_id='00000000-0000-0000-0000-00000000f0f0' then raise exception 'El foro de preguntas libres no se puede eliminar'; end if;
 if p_kind='noticia' then delete from public.plaza_news where id=p_id::uuid;
 elsif p_kind='comentario' then delete from public.plaza_news_comments where id=p_id::uuid;
 elsif p_kind='pregunta' then delete from public.plaza_threads where id=p_id::uuid;
 elsif p_kind in ('respuesta','mensaje') then delete from public.plaza_messages where id=p_id::uuid;
 elsif p_kind in ('grupo','canal','foro') then delete from public.plaza_spaces where id=p_id::uuid;
 elsif p_kind in ('publicacion','comentario_feed') then
  update public.ys_docs set data=jsonb_set(data,'{items}',coalesce((select jsonb_agg(e) from jsonb_array_elements(data->'items') e
    where (case p_kind when 'publicacion' then 'p_' else 'c_' end)||(e->>'id')<>p_id),'[]'))
   where col=case p_kind when 'publicacion' then 'posts' else 'comments' end and uid=i.author_id;
  delete from public.ys_pins where item_id=p_id;
 elsif p_kind='canal_feed' then
  delete from public.ys_docs where col='channels' and uid=i.author_id;
  delete from public.ys_pins where item_id=p_id;
 else raise exception 'Tipo no válido'; end if;
 perform public.plaza_audit_add('Eliminó '||p_kind,coalesce(nullif(i.title,''),left(i.body,120)),jsonb_build_object('motivo',p_reason,'titulo',i.title,'texto',left(i.body,1000),'autor',i.author_id,'archivos',i.media));
end $$;

-- 7. Anclar publicaciones y canales del feed en un puesto exacto.
create function public.plaza_admin_pin_feed(p_kind text,p_id text,p_rank int) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('admin'); e int; n int; label text;
begin
 if p_kind not in ('post','channel') then raise exception 'Tipo no válido'; end if;
 if p_rank is not null and (p_rank<1 or p_rank>50) then raise exception 'La posición debe estar entre 1 y 50'; end if;
 select x.title into label from public.plaza_items() x where x.id=p_id and x.kind=case p_kind when 'post' then 'publicacion' else 'canal_feed' end;
 if label is null then raise exception 'Ese contenido ya no existe'; end if;
 delete from public.ys_pins where item_id=p_id;
 if p_rank is not null then
  e:=p_rank; while exists(select 1 from public.ys_pins where kind=p_kind and rank=e) loop e:=e+1; end loop;
  if e>50 then raise exception 'Ya no hay posiciones libres'; end if;
  for n in reverse e-1..p_rank loop update public.ys_pins set rank=n+1 where kind=p_kind and rank=n; end loop;
  insert into public.ys_pins(item_id,kind,rank) values(p_id,p_kind,p_rank);
 end if;
 perform public.plaza_audit_add(case when p_rank is null then 'Desancló' else 'Ancló en el puesto '||p_rank end,label);
end $$;
revoke execute on function public.plaza_admin_delete(text,text,text),public.plaza_admin_pin_feed(text,text,int) from public,anon,authenticated;

-- 8. Ajustes del resto de funciones del panel al id de texto y al feed.
do $$
declare d text; o text;
begin
 -- Resumen
 d:=pg_get_functiondef('public.plaza_admin_stats()'::regprocedure); o:=d;
 d:=replace(d,$a$'news',(select count(*) from public.plaza_news),$a$,
  $a$'news',(select count(*) from public.plaza_news),'posts',(select count(*) from public.plaza_items() i where i.kind='publicacion'),'feed_comments',(select count(*) from public.plaza_items() i where i.kind='comentario_feed'),'feed_channels',(select count(*) from public.plaza_items() i where i.kind='canal_feed'),$a$);
 if d=o then raise exception 'stats'; end if; execute d;
 -- Usuarios
 d:=pg_get_functiondef('public.plaza_admin_users(text,text,text,integer,integer)'::regprocedure); o:=d;
 d:=replace(d,$a$'news',(select count(*) from public.plaza_news n where n.author_id=b.id),$a$,
  $a$'news',(select count(*) from public.plaza_news n where n.author_id=b.id),'posts',(select count(*) from public.plaza_items() i where i.author_id=b.id and i.kind='publicacion'),'alias',(select y.data->>'alias' from public.ys_docs y where y.col='accounts' and y.uid=b.id),$a$);
 d:=replace(d,$a$+(select count(*) from public.plaza_messages m where m.author_id=b.id)$a$,
  $a$+(select count(*) from public.plaza_messages m where m.author_id=b.id)+(select count(*) from public.plaza_items() i where i.author_id=b.id and i.kind='comentario_feed')$a$);
 d:=replace(d,$a$'spaces',(select count(*) from public.plaza_spaces s where s.owner_id=b.id),$a$,
  $a$'spaces',(select count(*) from public.plaza_spaces s where s.owner_id=b.id)+(select count(*) from public.ys_docs y where y.col='channels' and y.uid=b.id),$a$);
 d:=replace(d,$a$where (lower(p.username) like q$a$,$a$where (lower(p.username) like q or lower(coalesce((select y.data->>'alias' from public.ys_docs y where y.col='accounts' and y.uid=p.id),'')) like q$a$);
 if d=o then raise exception 'users'; end if; execute d;
 -- Contenido
 d:=pg_get_functiondef('public.plaza_admin_content(text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,integer,integer)'::regprocedure); o:=d;
 d:=replace(d,'l.ref_id=i.id','l.ref=i.id'); d:=replace(d,'l.ref_id=b.id','l.ref=b.id');
 d:=replace(d,$a$i.kind in ('grupo','canal','foro')$a$,$a$i.kind in ('grupo','canal','foro','canal_feed')$a$);
 d:=replace(d,$a$(p_kind='todos' or i.kind=p_kind$a$,$a$(p_kind='todos' or i.kind=p_kind or (p_kind='feed' and i.kind in ('publicacion','comentario_feed','canal_feed'))$a$);
 d:=replace(d,$a$(p_tipo='normal' and i.kind='noticia' and not i.is_breaking)$a$,$a$(p_tipo='normal' and i.kind in ('noticia','publicacion') and not i.is_breaking)$a$);
 d:=replace(d,$a$'municipios',(select coalesce(jsonb_agg(distinct n.municipio),'[]') from public.plaza_news n)$a$,
  $a$'municipios',(select coalesce(jsonb_agg(distinct x.municipio),'[]') from public.plaza_items() x where x.kind in ('noticia','publicacion') and x.municipio is not null)$a$);
 if d=o then raise exception 'content'; end if; execute d;
 -- Usuario
 d:=pg_get_functiondef('public.plaza_admin_user(uuid)'::regprocedure); o:=d;
 d:=replace(d,$a$'dm_count',$a$,$a$'feed',(select y.data from public.ys_docs y where y.col='accounts' and y.uid=p.id),'dm_count',$a$);
 if d=o then raise exception 'user'; end if; execute d;
 -- Anclados
 d:=pg_get_functiondef('public.plaza_admin_pins()'::regprocedure); o:=d;
 d:=replace(d,$a$'news',$a$,$a$'feed',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'type',case x.kind when 'publicacion' then 'post' else 'channel' end,'pin_rank',x.pin_rank) order by x.kind,x.pin_rank),'[]') from public.plaza_items() x where x.kind in ('publicacion','canal_feed') and x.pin_rank is not null),'news',$a$);
 if d=o then raise exception 'pins'; end if; execute d;
 -- Expedientes
 d:=pg_get_functiondef('public.plaza_admin_export(text,uuid,text,boolean)'::regprocedure); o:=d;
 d:=replace(d,'l.ref_id=i.id','l.ref=i.id'); d:=replace(d,'l.ref_id=d.id','l.ref=d.id::text');
 d:=replace(d,'select l.created_at,l.kind,l.ref_id,l.user_agent,p.username','select l.created_at,l.kind,coalesce(l.ref,l.ref_id::text) ref_id,l.user_agent,p.username');
 d:=replace(d,$a$'follows',$a$,$a$'feed',(select y.data from public.ys_docs y where y.col='accounts' and y.uid=p_user),'feed_channel',(select y.data from public.ys_docs y where y.col='channels' and y.uid=p_user),'follows',$a$);
 if d=o then raise exception 'export'; end if; execute d;
 -- Puerta del panel
 d:=pg_get_functiondef('public.plaza_panel(text,jsonb)'::regprocedure); o:=d;
 d:=replace(d,$a$perform public.plaza_admin_delete(p_a->>'kind',i,coalesce(p_a->>'reason',''));$a$,$a$perform public.plaza_admin_delete(p_a->>'kind',p_a->>'id',coalesce(p_a->>'reason',''));$a$);
 d:=replace(d,$a$perform public.plaza_admin_pin(p_a->>'kind',i,(p_a->>'rank')::int);$a$,
  $a$if p_a->>'kind' in ('post','channel') then perform public.plaza_admin_pin_feed(p_a->>'kind',p_a->>'id',(p_a->>'rank')::int); else perform public.plaza_admin_pin(p_a->>'kind',i,(p_a->>'rank')::int); end if;$a$);
 if d=o then raise exception 'panel'; end if; execute d;
end $$;
