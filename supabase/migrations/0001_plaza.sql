-- Plaza: todo lleva el prefijo plaza_ para convivir con otras apps en el mismo proyecto.
create table public.plaza_profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9._]{3,20}$'),
  created_at timestamptz not null default now());
create unique index plaza_profiles_username_lc on public.plaza_profiles(lower(username));

create table public.plaza_contacts(
  user_id uuid primary key references public.plaza_profiles(id) on delete cascade,
  email text check (email is null or length(email)<=200),
  phone text check (phone is null or length(phone)<=30));

create table public.plaza_spaces(
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('foro','grupo','canal')),
  name text not null check (char_length(name) between 3 and 40),
  is_private boolean not null default false,
  owner_id uuid not null references public.plaza_profiles(id) on delete cascade,
  lat double precision, lng double precision, place text check (char_length(place)<=80),
  created_at timestamptz not null default now());
-- La descripción va aparte: quien no tiene permiso en un privado no debe leerla.
create table public.plaza_space_details(
  space_id uuid primary key references public.plaza_spaces(id) on delete cascade,
  description text not null default '' check (char_length(description)<=200));
create table public.plaza_members(
  space_id uuid references public.plaza_spaces(id) on delete cascade,
  user_id uuid references public.plaza_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(space_id,user_id));
create index on public.plaza_members(user_id);
create table public.plaza_requests(
  space_id uuid references public.plaza_spaces(id) on delete cascade,
  user_id uuid references public.plaza_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','rejected')),
  created_at timestamptz not null default now(),
  primary key(space_id,user_id));

create table public.plaza_threads(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.plaza_spaces(id) on delete cascade,
  author_id uuid not null references public.plaza_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 140),
  body text not null default '' check (char_length(body)<=4000),
  vote_count int not null default 0,
  created_at timestamptz not null default now());
create index on public.plaza_threads(space_id,created_at desc);
create table public.plaza_messages(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.plaza_spaces(id) on delete cascade,
  thread_id uuid references public.plaza_threads(id) on delete cascade,
  author_id uuid not null references public.plaza_profiles(id) on delete cascade,
  body text not null default '' check (char_length(body)<=4000),
  media jsonb not null default '[]',
  lat double precision, lng double precision, place text check (char_length(place)<=80),
  is_best boolean not null default false,
  like_count int not null default 0,
  created_at timestamptz not null default now());
create index on public.plaza_messages(space_id,created_at);
create index on public.plaza_messages(thread_id,created_at);
create table public.plaza_likes(
  message_id uuid references public.plaza_messages(id) on delete cascade,
  user_id uuid references public.plaza_profiles(id) on delete cascade,
  primary key(message_id,user_id));
create table public.plaza_thread_votes(
  thread_id uuid references public.plaza_threads(id) on delete cascade,
  user_id uuid references public.plaza_profiles(id) on delete cascade,
  primary key(thread_id,user_id));

create table public.plaza_news(
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.plaza_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 8 and 120),
  body text not null default '' check (char_length(body)<=4000),
  context text not null default '' check (char_length(context)<=4000),
  municipio text not null check (char_length(municipio) between 2 and 40),
  is_breaking boolean not null default false,
  media jsonb not null default '[]',
  lat double precision, lng double precision, place text check (char_length(place)<=80),
  up_count int not null default 0, down_count int not null default 0,
  created_at timestamptz not null default now());
create index on public.plaza_news(created_at desc);
create table public.plaza_news_votes(
  news_id uuid references public.plaza_news(id) on delete cascade,
  user_id uuid references public.plaza_profiles(id) on delete cascade,
  value smallint not null check (value in (1,-1)),
  primary key(news_id,user_id));
create table public.plaza_news_comments(
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.plaza_news(id) on delete cascade,
  author_id uuid not null references public.plaza_profiles(id) on delete cascade,
  body text not null default '' check (char_length(body)<=4000),
  media jsonb not null default '[]',
  created_at timestamptz not null default now());
create index on public.plaza_news_comments(news_id,created_at);

create table public.plaza_dms(
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.plaza_profiles(id) on delete cascade,
  recipient_id uuid not null references public.plaza_profiles(id) on delete cascade,
  body text not null default '' check (char_length(body)<=4000),
  media jsonb not null default '[]',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id<>recipient_id));
create index on public.plaza_dms(recipient_id,created_at);
create index on public.plaza_dms(sender_id,created_at);

-- Permisos
create function public.plaza_is_member(s uuid) returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.plaza_members m where m.space_id=s and m.user_id=auth.uid()) $$;
create function public.plaza_can_read(s uuid) returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.plaza_spaces x where x.id=s and (not x.is_private or exists(select 1 from public.plaza_members m where m.space_id=s and m.user_id=auth.uid()))) $$;
create function public.plaza_can_post(s uuid) returns boolean language sql stable security definer set search_path='' as
$$ select auth.uid() is not null and exists(select 1 from public.plaza_spaces x where x.id=s
   and (x.owner_id=auth.uid() or (x.type<>'canal' and (not x.is_private or exists(select 1 from public.plaza_members m where m.space_id=s and m.user_id=auth.uid()))))) $$;
create function public.plaza_is_owner(s uuid) returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.plaza_spaces x where x.id=s and x.owner_id=auth.uid()) $$;
create function public.plaza_is_public(s uuid) returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.plaza_spaces x where x.id=s and not x.is_private) $$;

alter table public.plaza_profiles enable row level security;
alter table public.plaza_contacts enable row level security;
alter table public.plaza_spaces enable row level security;
alter table public.plaza_space_details enable row level security;
alter table public.plaza_members enable row level security;
alter table public.plaza_requests enable row level security;
alter table public.plaza_threads enable row level security;
alter table public.plaza_messages enable row level security;
alter table public.plaza_likes enable row level security;
alter table public.plaza_thread_votes enable row level security;
alter table public.plaza_news enable row level security;
alter table public.plaza_news_votes enable row level security;
alter table public.plaza_news_comments enable row level security;
alter table public.plaza_dms enable row level security;

create policy read on public.plaza_profiles for select to anon,authenticated using (true);
create policy own on public.plaza_contacts for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy read on public.plaza_spaces for select to anon,authenticated using (true);
create policy read on public.plaza_space_details for select to anon,authenticated using (public.plaza_can_read(space_id));
create policy read on public.plaza_members for select to anon,authenticated using (user_id=auth.uid() or public.plaza_can_read(space_id));
create policy join_public on public.plaza_members for insert to authenticated with check (user_id=auth.uid() and public.plaza_is_public(space_id));
create policy leave on public.plaza_members for delete to authenticated using (user_id=auth.uid() and not public.plaza_is_owner(space_id));
create policy read on public.plaza_requests for select to authenticated using (user_id=auth.uid() or public.plaza_is_owner(space_id));
create policy cancel on public.plaza_requests for delete to authenticated using (user_id=auth.uid() and status='pending');
create policy read on public.plaza_threads for select to anon,authenticated using (public.plaza_can_read(space_id));
create policy post on public.plaza_threads for insert to authenticated with check (author_id=auth.uid() and public.plaza_can_post(space_id));
create policy remove on public.plaza_threads for delete to authenticated using (author_id=auth.uid());
create policy read on public.plaza_messages for select to anon,authenticated using (public.plaza_can_read(space_id));
create policy post on public.plaza_messages for insert to authenticated with check (author_id=auth.uid() and public.plaza_can_post(space_id) and not is_best and like_count=0);
create policy remove on public.plaza_messages for delete to authenticated using (author_id=auth.uid());
create policy own on public.plaza_likes for select to authenticated using (user_id=auth.uid());
create policy add on public.plaza_likes for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.plaza_messages m where m.id=message_id));
create policy remove on public.plaza_likes for delete to authenticated using (user_id=auth.uid());
create policy own on public.plaza_thread_votes for select to authenticated using (user_id=auth.uid());
create policy add on public.plaza_thread_votes for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.plaza_threads t where t.id=thread_id));
create policy remove on public.plaza_thread_votes for delete to authenticated using (user_id=auth.uid());
create policy read on public.plaza_news for select to anon,authenticated using (true);
create policy post on public.plaza_news for insert to authenticated with check (author_id=auth.uid() and up_count=0 and down_count=0);
create policy remove on public.plaza_news for delete to authenticated using (author_id=auth.uid());
create policy own on public.plaza_news_votes for select to authenticated using (user_id=auth.uid());
create policy add on public.plaza_news_votes for insert to authenticated with check (user_id=auth.uid());
create policy change on public.plaza_news_votes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy remove on public.plaza_news_votes for delete to authenticated using (user_id=auth.uid());
create policy read on public.plaza_news_comments for select to anon,authenticated using (true);
create policy post on public.plaza_news_comments for insert to authenticated with check (author_id=auth.uid());
create policy remove on public.plaza_news_comments for delete to authenticated using (author_id=auth.uid());
create policy read on public.plaza_dms for select to authenticated using (auth.uid() in (sender_id,recipient_id));
create policy send on public.plaza_dms for insert to authenticated with check (sender_id=auth.uid() and read_at is null);

-- Conteos
create function public.plaza_news_vote_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare n uuid:=coalesce(new.news_id,old.news_id);
begin update public.plaza_news p set
  up_count=(select count(*) from public.plaza_news_votes v where v.news_id=n and v.value=1),
  down_count=(select count(*) from public.plaza_news_votes v where v.news_id=n and v.value=-1) where p.id=n;
 return null; end $$;
create trigger sync after insert or update or delete on public.plaza_news_votes for each row execute function public.plaza_news_vote_sync();
create function public.plaza_like_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare n uuid:=coalesce(new.message_id,old.message_id);
begin update public.plaza_messages p set like_count=(select count(*) from public.plaza_likes v where v.message_id=n) where p.id=n; return null; end $$;
create trigger sync after insert or delete on public.plaza_likes for each row execute function public.plaza_like_sync();
create function public.plaza_tvote_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare n uuid:=coalesce(new.thread_id,old.thread_id);
begin update public.plaza_threads p set vote_count=(select count(*) from public.plaza_thread_votes v where v.thread_id=n) where p.id=n; return null; end $$;
create trigger sync after insert or delete on public.plaza_thread_votes for each row execute function public.plaza_tvote_sync();

-- Acciones
create function public.plaza_create_space(p_type text,p_name text,p_description text,p_private boolean,p_lat double precision,p_lng double precision,p_place text,p_question text default null)
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
create function public.plaza_request_access(p_space uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Necesitas una cuenta'; end if;
 if not exists(select 1 from public.plaza_spaces where id=p_space and is_private) then raise exception 'Este espacio no es privado'; end if;
 if public.plaza_is_member(p_space) then return; end if;
 insert into public.plaza_requests(space_id,user_id) values(p_space,auth.uid())
 on conflict (space_id,user_id) do update set status='pending',created_at=now();
end $$;
create function public.plaza_answer_request(p_space uuid,p_user uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.plaza_is_owner(p_space) then raise exception 'Solo el administrador puede responder'; end if;
 if p_approve then
  insert into public.plaza_members(space_id,user_id) values(p_space,p_user) on conflict do nothing;
  delete from public.plaza_requests where space_id=p_space and user_id=p_user;
 else update public.plaza_requests set status='rejected' where space_id=p_space and user_id=p_user; end if;
end $$;
create function public.plaza_mark_best(p_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 select m.thread_id into t from public.plaza_messages m join public.plaza_threads h on h.id=m.thread_id where m.id=p_message and h.author_id=auth.uid();
 if t is null then raise exception 'Solo quien preguntó puede elegir la mejor respuesta'; end if;
 update public.plaza_messages set is_best=(id=p_message) where thread_id=t;
end $$;
create function public.plaza_mark_read(p_other uuid) returns void language sql security definer set search_path='' as
$$ update public.plaza_dms set read_at=now() where recipient_id=auth.uid() and sender_id=p_other and read_at is null $$;
create function public.plaza_space_count(p_space uuid) returns int language sql stable security definer set search_path='' as
$$ select case when public.plaza_can_read(p_space) then (select count(*)::int from public.plaza_members where space_id=p_space) end $$;
-- Búsqueda para respuestas automáticas: solo contenido público.
create function public.plaza_search(q text) returns table(kind text,id uuid,space_id uuid,title text,snippet text,score int)
language sql stable security definer set search_path='' as $$
 with w as (select distinct regexp_replace(t,'(es|s)$','') t from regexp_split_to_table(translate(lower(q),'áéíóúü¿?¡!.,;:','aeiouu'),'\s+') t
   where length(t)>2 and t not in ('que','como','cual','cuales','donde','cuando','cuanto','hay','para','por','una','uno','con','los','las','del','alguien','quien','hoy','esta','este','tengo','puedo','sabe','saben','sobre','tiene','noticia','noticias')),
 n as (select count(*) c from w),
 d as (
  select 'news' kind,x.id,null::uuid space_id,x.title,left(coalesce(nullif(x.body,''),x.context),240) snippet,x.title ttl,x.body||' '||x.context||' '||x.municipio txt from public.plaza_news x
  union all select 'thread',h.id,h.space_id,h.title,left(coalesce((select m.body from public.plaza_messages m where m.thread_id=h.id order by m.is_best desc,m.like_count desc limit 1),h.body),240),h.title,h.body||' '||coalesce((select string_agg(m.body,' ') from public.plaza_messages m where m.thread_id=h.id),'')
   from public.plaza_threads h join public.plaza_spaces s on s.id=h.space_id where not s.is_private
  union all select 'space',s.id,s.id,s.name,left(coalesce((select m.body from public.plaza_messages m where m.space_id=s.id order by m.created_at desc limit 1),''),240),s.name,coalesce((select string_agg(m.body,' ') from public.plaza_messages m where m.space_id=s.id and m.thread_id is null),'')
   from public.plaza_spaces s where not s.is_private and s.type<>'foro'),
 r as (select d.*,(select count(*) from w where translate(lower(d.ttl||' '||d.txt),'áéíóúü','aeiouu') ~ ('\m'||w.t||'(es|s)?\M')) hit,
   (select count(*) from w where translate(lower(d.ttl),'áéíóúü','aeiouu') ~ ('\m'||w.t||'(es|s)?\M')) th from d)
 select r.kind,r.id,r.space_id,r.title,r.snippet,(r.th*3+r.hit)::int from r,n where n.c>0 and r.hit>=ceil(n.c/2.0) order by 6 desc limit 4
$$;

revoke execute on function public.plaza_news_vote_sync(),public.plaza_like_sync(),public.plaza_tvote_sync() from public,anon,authenticated;
revoke execute on function public.plaza_create_space(text,text,text,boolean,double precision,double precision,text,text),public.plaza_request_access(uuid),public.plaza_answer_request(uuid,uuid,boolean),public.plaza_mark_best(uuid),public.plaza_mark_read(uuid) from public,anon;
grant execute on function public.plaza_create_space(text,text,text,boolean,double precision,double precision,text,text),public.plaza_request_access(uuid),public.plaza_answer_request(uuid,uuid,boolean),public.plaza_mark_best(uuid),public.plaza_mark_read(uuid) to authenticated;

-- Archivos: pub/<usuario>/..., priv/<espacio>/..., dm/<a>_<b>/...
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('plaza-media','plaza-media',false,52428800,array['image/*','video/*','audio/*']);
create function public.plaza_storage_read(p text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a text[]:=string_to_array(p,'/');
begin
 if a[1]='pub' then return true; end if;
 if a[1]='priv' then return public.plaza_can_read(a[2]::uuid); end if;
 if a[1]='dm' then return auth.uid()::text = any(string_to_array(a[2],'_')); end if;
 return false;
exception when others then return false; end $$;
create function public.plaza_storage_write(p text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a text[]:=string_to_array(p,'/');
begin
 if auth.uid() is null then return false; end if;
 if a[1]='pub' then return a[2]=auth.uid()::text; end if;
 if a[1]='priv' then return public.plaza_is_member(a[2]::uuid); end if;
 if a[1]='dm' then return auth.uid()::text = any(string_to_array(a[2],'_')); end if;
 return false;
exception when others then return false; end $$;
create policy plaza_read on storage.objects for select to anon,authenticated using (bucket_id='plaza-media' and public.plaza_storage_read(name));
create policy plaza_write on storage.objects for insert to authenticated with check (bucket_id='plaza-media' and public.plaza_storage_write(name));

alter publication supabase_realtime add table public.plaza_news,public.plaza_threads,public.plaza_messages,public.plaza_news_comments,public.plaza_dms;

create function public.plaza_free_forum() returns uuid language plpgsql security definer set search_path='' as $$
declare f constant uuid:='00000000-0000-0000-0000-00000000f0f0';
begin
 if auth.uid() is null then raise exception 'Necesitas una cuenta'; end if;
 insert into public.plaza_spaces(id,type,name,is_private,owner_id,place) values(f,'foro','Preguntas libres',false,auth.uid(),null) on conflict do nothing;
 insert into public.plaza_space_details values(f,'Preguntas sin una comunidad específica.') on conflict do nothing;
 return f;
end $$;
revoke execute on function public.plaza_free_forum() from public,anon;
grant execute on function public.plaza_free_forum() to authenticated;
