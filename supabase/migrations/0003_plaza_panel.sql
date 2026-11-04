-- Panel de control: perfiles de equipo, IP, suspensiones, anclados, alertas y auditoría.
-- Las tablas privadas no tienen políticas: solo se leen con las funciones plaza_admin_*,
-- y cada función comprueba el perfil de quien la llama.

create table public.plaza_staff(
  user_id uuid primary key references public.plaza_profiles(id) on delete cascade,
  role text not null check (role in ('admin','supervisor','moderador')),
  granted_by uuid references public.plaza_profiles(id) on delete set null,
  created_at timestamptz not null default now());
create table public.plaza_sanctions(
  user_id uuid primary key references public.plaza_profiles(id) on delete cascade,
  until timestamptz, -- sin fecha: suspensión indefinida
  reason text not null default '' check (char_length(reason)<=300),
  created_by uuid references public.plaza_profiles(id) on delete set null,
  created_at timestamptz not null default now());
create table public.plaza_ip_log(
  id bigint generated always as identity primary key,
  user_id uuid not null references public.plaza_profiles(id) on delete cascade,
  ip text not null,
  kind text not null,
  ref_id uuid,
  user_agent text,
  created_at timestamptz not null default now());
create index on public.plaza_ip_log(ip,created_at desc);
create index on public.plaza_ip_log(user_id,created_at desc);
create index on public.plaza_ip_log(ref_id);
create table public.plaza_audit(
  id bigint generated always as identity primary key,
  actor_id uuid references public.plaza_profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  target text not null default '',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now());
create index on public.plaza_audit(created_at desc);
create table public.plaza_alerts(
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  body text not null default '' check (char_length(body)<=500),
  level text not null default 'aviso' check (level in ('aviso','alarma')),
  audience text not null default 'todos' check (audience in ('todos','usuarios','usuario')),
  target_user uuid references public.plaza_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  check ((audience='usuario')=(target_user is not null)));
create index on public.plaza_alerts(created_at desc);
create table public.plaza_push_subs(
  endpoint text primary key check (char_length(endpoint)<=1000),
  p256dh text not null check (char_length(p256dh)<=200),
  auth text not null check (char_length(auth)<=100),
  user_id uuid references public.plaza_profiles(id) on delete set null,
  created_at timestamptz not null default now());
create table public.plaza_push_config(
  id int primary key default 1 check (id=1),
  public_key text not null,
  private_key text not null);

alter table public.plaza_staff enable row level security;
alter table public.plaza_sanctions enable row level security;
alter table public.plaza_ip_log enable row level security;
alter table public.plaza_audit enable row level security;
alter table public.plaza_alerts enable row level security;
alter table public.plaza_push_subs enable row level security;
alter table public.plaza_push_config enable row level security;
create policy read on public.plaza_alerts for select to anon,authenticated using (
  expires_at>now() and (audience='todos' or (audience='usuarios' and auth.uid() is not null) or target_user=auth.uid()));

-- Anclados: la posición exacta en la lista. Lo demás llena los puestos libres.
alter table public.plaza_news add column pin_rank int check (pin_rank between 1 and 50);
alter table public.plaza_spaces add column pin_rank int check (pin_rank between 1 and 50);
create unique index plaza_news_pin on public.plaza_news(pin_rank) where pin_rank is not null;
create unique index plaza_spaces_pin on public.plaza_spaces((type='foro'),pin_rank) where pin_rank is not null;

-- Ayudas internas
create function public.plaza_staff_role(u uuid default auth.uid()) returns text language sql stable security definer set search_path='' as
$$ select s.role from public.plaza_staff s where s.user_id=u $$;
create function public.plaza_rank(r text) returns int language sql immutable set search_path='' as
$$ select case r when 'admin' then 3 when 'supervisor' then 2 when 'moderador' then 1 else 0 end $$;
create function public.plaza_need(p_min text) returns text language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_staff_role();
begin
 if public.plaza_rank(r)<public.plaza_rank(p_min) or r is null then raise exception 'Tu perfil no tiene permiso para esto' using errcode='42501'; end if;
 return r;
end $$;
create function public.plaza_is_suspended(u uuid) returns boolean language sql stable security definer set search_path='' as
$$ select exists(select 1 from public.plaza_sanctions s where s.user_id=u and (s.until is null or s.until>now())) $$;
create function public.plaza_request_ip() returns text language plpgsql stable set search_path='' as $$
declare h jsonb; v text;
begin
 begin h:=nullif(current_setting('request.headers',true),'')::jsonb; exception when others then return null; end;
 if h is null then return null; end if;
 v:=coalesce(h->>'cf-connecting-ip',h->>'x-real-ip',split_part(coalesce(h->>'x-forwarded-for',''),',',1));
 return left(nullif(trim(v),''),64);
end $$;
create function public.plaza_request_agent() returns text language plpgsql stable set search_path='' as $$
begin return left(nullif(current_setting('request.headers',true),'')::jsonb->>'user-agent',300);
exception when others then return null; end $$;
create function public.plaza_audit_add(p_action text,p_target text,p_detail jsonb default '{}') returns void language sql security definer set search_path='' as
$$ insert into public.plaza_audit(actor_id,actor_name,action,target,detail)
   select auth.uid(),coalesce((select username from public.plaza_profiles where id=auth.uid()),'sistema'),p_action,left(coalesce(p_target,''),200),p_detail $$;

-- Antes de publicar: frena a las cuentas suspendidas y evita que alguien se ancle solo.
create function public.plaza_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and public.plaza_is_suspended(auth.uid()) then raise exception 'Tu cuenta está suspendida'; end if;
 if tg_table_name in ('plaza_news','plaza_spaces') and auth.uid() is not null then new.pin_rank:=null; end if;
 return new;
end $$;
-- Después de publicar: guarda la IP. Un fallo aquí nunca debe impedir la publicación.
create function public.plaza_log_ip() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=tg_argv[0]; a uuid:=auth.uid(); i text;
begin
 begin
  i:=public.plaza_request_ip();
  if a is not null and i is not null then
   if k='mensaje' and to_jsonb(new)->>'thread_id' is not null then k:='respuesta'; end if;
   insert into public.plaza_ip_log(user_id,ip,kind,ref_id,user_agent) values(a,i,k,(to_jsonb(new)->>'id')::uuid,public.plaza_request_agent());
  end if;
 exception when others then null; end;
 return null;
end $$;
create trigger plaza_guard before insert on public.plaza_news for each row execute function public.plaza_guard();
create trigger plaza_guard before insert on public.plaza_spaces for each row execute function public.plaza_guard();
create trigger plaza_guard before insert on public.plaza_threads for each row execute function public.plaza_guard();
create trigger plaza_guard before insert on public.plaza_messages for each row execute function public.plaza_guard();
create trigger plaza_guard before insert on public.plaza_news_comments for each row execute function public.plaza_guard();
create trigger plaza_guard before insert on public.plaza_dms for each row execute function public.plaza_guard();
create trigger plaza_ip after insert on public.plaza_news for each row execute function public.plaza_log_ip('noticia');
create trigger plaza_ip after insert on public.plaza_spaces for each row execute function public.plaza_log_ip('espacio');
create trigger plaza_ip after insert on public.plaza_threads for each row execute function public.plaza_log_ip('pregunta');
create trigger plaza_ip after insert on public.plaza_messages for each row execute function public.plaza_log_ip('mensaje');
create trigger plaza_ip after insert on public.plaza_news_comments for each row execute function public.plaza_log_ip('comentario');
create trigger plaza_ip after insert on public.plaza_dms for each row execute function public.plaza_log_ip('privado');

-- La app avisa al abrir. Se guarda un ingreso por IP cada 6 horas.
create function public.plaza_touch() returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); i text:=public.plaza_request_ip();
begin
 if a is null or i is null then return; end if;
 if exists(select 1 from public.plaza_ip_log l where l.user_id=a and l.ip=i and l.kind='ingreso' and l.created_at>now()-interval '6 hours') then return; end if;
 insert into public.plaza_ip_log(user_id,ip,kind,user_agent) values(a,i,'ingreso',public.plaza_request_agent());
end $$;

-- Todo el contenido en una sola lista
create function public.plaza_items() returns table(kind text,id uuid,author_id uuid,title text,body text,municipio text,space_id uuid,space_name text,is_private boolean,is_breaking boolean,media jsonb,up int,down int,pin_rank int,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select 'noticia',n.id,n.author_id,n.title,n.body,n.municipio,null::uuid,null::text,false,n.is_breaking,n.media,n.up_count,n.down_count,n.pin_rank,n.created_at from public.plaza_news n
 union all select 'comentario',c.id,c.author_id,left(x.title,120),c.body,x.municipio,null,null,false,false,c.media,0,0,null,c.created_at from public.plaza_news_comments c join public.plaza_news x on x.id=c.news_id
 union all select 'pregunta',t.id,t.author_id,t.title,t.body,s.place,s.id,s.name,s.is_private,false,'[]'::jsonb,t.vote_count,0,null,t.created_at from public.plaza_threads t join public.plaza_spaces s on s.id=t.space_id
 union all select case when m.thread_id is null then 'mensaje' else 'respuesta' end,m.id,m.author_id,'',m.body,m.place,s.id,s.name,s.is_private,false,m.media,m.like_count,0,null,m.created_at from public.plaza_messages m join public.plaza_spaces s on s.id=m.space_id
 union all select s.type,s.id,s.owner_id,s.name,coalesce(d.description,''),s.place,s.id,s.name,s.is_private,false,'[]'::jsonb,0,0,s.pin_rank,s.created_at from public.plaza_spaces s left join public.plaza_space_details d on d.space_id=s.id
$$;

create function public.plaza_admin_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador');
begin return jsonb_build_object('role',r,'username',(select username from public.plaza_profiles where id=auth.uid())); end $$;

create function public.plaza_admin_stats() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador'); d date:=(now() at time zone 'America/Bogota')::date;
begin return jsonb_build_object(
 'users',(select count(*) from public.plaza_profiles),
 'users_today',(select count(*) from public.plaza_profiles p where (p.created_at at time zone 'America/Bogota')::date=d),
 'news',(select count(*) from public.plaza_news),
 'spaces',(select count(*) from public.plaza_spaces),
 'threads',(select count(*) from public.plaza_threads),
 'comments',(select count(*) from public.plaza_news_comments),
 'messages',(select count(*) from public.plaza_messages),
 'suspended',(select count(*) from public.plaza_sanctions s where s.until is null or s.until>now()),
 'shared_ips',case when public.plaza_rank(r)>=2 then (select count(*) from (select 1 from public.plaza_ip_log l group by l.ip having count(distinct l.user_id)>1) x) end,
 'active_alerts',(select count(*) from public.plaza_alerts a where a.expires_at>now()),
 'push_subs',(select count(*) from public.plaza_push_subs),
 'series',(select coalesce(jsonb_agg(jsonb_build_object('day',g.day,'count',(select count(*) from public.plaza_items() i where (i.created_at at time zone 'America/Bogota')::date=g.day)) order by g.day),'[]') from (select (d-n) as day from generate_series(0,13) n) g));
end $$;

create function public.plaza_admin_users(p_q text default '',p_ip text default null,p_filter text default 'todos',p_limit int default 50,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador'); priv boolean:=public.plaza_rank(r)>=2; q text:='%'||replace(replace(replace(lower(trim(coalesce(p_q,''))),'\','\\'),'%','\%'),'_','\_')||'%'; res jsonb;
begin
 if p_ip is not null and not priv then raise exception 'Tu perfil no puede ver direcciones IP' using errcode='42501'; end if;
 if p_filter in ('contacto','ip_compartida') and not priv then raise exception 'Tu perfil no tiene permiso para este filtro' using errcode='42501'; end if;
 with base as (
  select p.id,p.username,p.created_at,c.email,c.phone,st.role,sa.until,sa.reason,(sa.user_id is not null and (sa.until is null or sa.until>now())) suspended
  from public.plaza_profiles p
  left join public.plaza_contacts c on c.user_id=p.id
  left join public.plaza_staff st on st.user_id=p.id
  left join public.plaza_sanctions sa on sa.user_id=p.id
  where (lower(p.username) like q or (priv and (lower(coalesce(c.email,'')) like q or lower(coalesce(c.phone,'')) like q)))
   and (p_ip is null or exists(select 1 from public.plaza_ip_log l where l.user_id=p.id and l.ip=p_ip))
   and (p_filter='todos' or (p_filter='equipo' and st.role is not null) or (p_filter='suspendidos' and sa.user_id is not null and (sa.until is null or sa.until>now()))
    or (p_filter='contacto' and (c.email is not null or c.phone is not null))
    or (p_filter='ip_compartida' and exists(select 1 from public.plaza_ip_log l join public.plaza_ip_log o on o.ip=l.ip and o.user_id<>l.user_id where l.user_id=p.id)))),
 page as (select * from base order by created_at desc limit least(greatest(p_limit,1),200) offset greatest(p_offset,0))
 select jsonb_build_object('total',(select count(*) from base),'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'id',b.id,'username',b.username,'created_at',b.created_at,'role',b.role,'suspended',b.suspended,'until',b.until,'reason',b.reason,
   'email',case when priv then b.email end,'phone',case when priv then b.phone end,
   'last_ip',case when priv then (select l.ip from public.plaza_ip_log l where l.user_id=b.id order by l.created_at desc limit 1) end,
   'last_seen',(select max(l.created_at) from public.plaza_ip_log l where l.user_id=b.id),
   'news',(select count(*) from public.plaza_news n where n.author_id=b.id),
   'spaces',(select count(*) from public.plaza_spaces s where s.owner_id=b.id),
   'threads',(select count(*) from public.plaza_threads t where t.author_id=b.id),
   'comments',(select count(*) from public.plaza_news_comments c where c.author_id=b.id)+(select count(*) from public.plaza_messages m where m.author_id=b.id)
  ) order by b.created_at desc) from page b),'[]')) into res;
 return res;
end $$;

create function public.plaza_admin_content(p_kind text default 'todos',p_q text default '',p_author text default '',p_ip text default null,p_tipo text default 'todos',p_municipio text default '',p_from timestamptz default null,p_to timestamptz default null,p_limit int default 50,p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador'); priv boolean:=public.plaza_rank(r)>=2; res jsonb;
 q text:='%'||replace(replace(replace(lower(trim(coalesce(p_q,''))),'\','\\'),'%','\%'),'_','\_')||'%';
 a text:='%'||replace(replace(replace(lower(trim(coalesce(p_author,''))),'\','\\'),'%','\%'),'_','\_')||'%';
begin
 if p_ip is not null and not priv then raise exception 'Tu perfil no puede ver direcciones IP' using errcode='42501'; end if;
 with base as (
  select i.*,p.username from public.plaza_items() i join public.plaza_profiles p on p.id=i.author_id
  where (p_kind='todos' or i.kind=p_kind or (p_kind='espacios' and i.kind in ('grupo','canal','foro')))
   and (lower(i.title||' '||i.body) like q) and (lower(p.username) like a)
   and (coalesce(p_municipio,'')='' or lower(coalesce(i.municipio,''))=lower(p_municipio))
   and (p_tipo='todos' or (p_tipo='ultima_hora' and i.is_breaking) or (p_tipo='normal' and i.kind='noticia' and not i.is_breaking) or (p_tipo='con_archivos' and jsonb_array_length(i.media)>0) or (p_tipo='anclado' and i.pin_rank is not null))
   and (p_from is null or i.created_at>=p_from) and (p_to is null or i.created_at<=p_to)
   and (p_ip is null or exists(select 1 from public.plaza_ip_log l where l.ref_id=i.id and l.ip=p_ip))),
 page as (select * from base order by created_at desc limit least(greatest(p_limit,1),200) offset greatest(p_offset,0))
 select jsonb_build_object('total',(select count(*) from base),
  'municipios',(select coalesce(jsonb_agg(distinct n.municipio),'[]') from public.plaza_news n),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('kind',b.kind,'id',b.id,'author_id',b.author_id,'username',b.username,'title',b.title,'body',b.body,'municipio',b.municipio,'space_name',b.space_name,'is_private',b.is_private,'is_breaking',b.is_breaking,'media',b.media,'up',b.up,'down',b.down,'pin_rank',b.pin_rank,'created_at',b.created_at,
   'ip',case when priv then (select l.ip from public.plaza_ip_log l where l.ref_id=b.id limit 1) end) order by b.created_at desc) from page b),'[]')) into res;
 return res;
end $$;

create function public.plaza_admin_ips(p_q text default '',p_min_users int default 1,p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor');
begin return coalesce((select jsonb_agg(to_jsonb(x)) from (
  select l.ip,count(distinct l.user_id)::int users,array_agg(distinct p.username) usernames,
   count(*) filter (where l.kind<>'ingreso')::int posts,count(*) filter (where l.kind='ingreso')::int logins,min(l.created_at) first_seen,max(l.created_at) last_seen
  from public.plaza_ip_log l join public.plaza_profiles p on p.id=l.user_id
  where l.ip like '%'||trim(coalesce(p_q,''))||'%'
  group by l.ip having count(distinct l.user_id)>=greatest(p_min_users,1)
  order by 2 desc,count(*) desc,max(l.created_at) desc limit least(greatest(p_limit,1),300)) x),'[]');
end $$;

create function public.plaza_admin_user(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador'); priv boolean:=public.plaza_rank(r)>=2; res jsonb;
begin
 select jsonb_build_object('id',p.id,'username',p.username,'created_at',p.created_at,
  'role',st.role,'until',sa.until,'reason',sa.reason,'suspended',(sa.user_id is not null and (sa.until is null or sa.until>now())),
  'email',case when priv then c.email end,'phone',case when priv then c.phone end,
  'dm_count',(select count(*) from public.plaza_dms d where p.id in (d.sender_id,d.recipient_id)),
  'following',(select coalesce(jsonb_agg(jsonb_build_object('name',s.name,'type',s.type)),'[]') from public.plaza_members m join public.plaza_spaces s on s.id=m.space_id where m.user_id=p.id and s.owner_id<>p.id),
  'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc),'[]') from public.plaza_items() i where i.author_id=p.id),
  'ips',case when priv then (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select l.ip,count(*)::int events,max(l.created_at) last_seen,(select count(distinct o.user_id)::int from public.plaza_ip_log o where o.ip=l.ip) users from public.plaza_ip_log l where l.user_id=p.id group by l.ip order by 3 desc) x) end)
 into res from public.plaza_profiles p left join public.plaza_contacts c on c.user_id=p.id left join public.plaza_staff st on st.user_id=p.id left join public.plaza_sanctions sa on sa.user_id=p.id where p.id=p_user;
 if res is null then raise exception 'Ese usuario ya no existe'; end if;
 return res;
end $$;

create function public.plaza_admin_delete(p_kind text,p_id uuid,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare i record; me text;
begin
 me:=public.plaza_need(case when p_kind in ('grupo','canal','foro') then 'supervisor' else 'moderador' end);
 select * into i from public.plaza_items() x where x.id=p_id and x.kind=p_kind;
 if not found then raise exception 'Ese contenido ya no existe'; end if;
 if p_id='00000000-0000-0000-0000-00000000f0f0' then raise exception 'El foro de preguntas libres no se puede eliminar'; end if;
 if public.plaza_rank(public.plaza_staff_role(i.author_id))>public.plaza_rank(me) then raise exception 'No puedes eliminar contenido de un perfil superior al tuyo' using errcode='42501'; end if;
 if p_kind='noticia' then delete from public.plaza_news where id=p_id;
 elsif p_kind='comentario' then delete from public.plaza_news_comments where id=p_id;
 elsif p_kind='pregunta' then delete from public.plaza_threads where id=p_id;
 elsif p_kind in ('respuesta','mensaje') then delete from public.plaza_messages where id=p_id;
 elsif p_kind in ('grupo','canal','foro') then delete from public.plaza_spaces where id=p_id;
 else raise exception 'Tipo no válido'; end if;
 perform public.plaza_audit_add('Eliminó '||p_kind,coalesce(nullif(i.title,''),left(i.body,120)),jsonb_build_object('motivo',p_reason,'titulo',i.title,'texto',left(i.body,1000),'autor',i.author_id));
end $$;

create function public.plaza_admin_pin(p_kind text,p_id uuid,p_rank int) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor'); e int; n int; foro boolean; label text;
begin
 if p_rank is not null and (p_rank<1 or p_rank>50) then raise exception 'La posición debe estar entre 1 y 50'; end if;
 if p_kind='noticia' then
  select title into label from public.plaza_news where id=p_id; if label is null then raise exception 'Esa noticia ya no existe'; end if;
  update public.plaza_news set pin_rank=null where id=p_id;
  if p_rank is not null then
   e:=p_rank; while exists(select 1 from public.plaza_news where pin_rank=e) loop e:=e+1; end loop;
   if e>50 then raise exception 'Ya no hay posiciones libres'; end if;
   for n in reverse e-1..p_rank loop update public.plaza_news set pin_rank=n+1 where pin_rank=n; end loop;
   update public.plaza_news set pin_rank=p_rank where id=p_id;
  end if;
 elsif p_kind='espacio' then
  select name,type='foro' into label,foro from public.plaza_spaces where id=p_id; if label is null then raise exception 'Ese espacio ya no existe'; end if;
  update public.plaza_spaces set pin_rank=null where id=p_id;
  if p_rank is not null then
   e:=p_rank; while exists(select 1 from public.plaza_spaces where pin_rank=e and (type='foro')=foro) loop e:=e+1; end loop;
   if e>50 then raise exception 'Ya no hay posiciones libres'; end if;
   for n in reverse e-1..p_rank loop update public.plaza_spaces set pin_rank=n+1 where pin_rank=n and (type='foro')=foro; end loop;
   update public.plaza_spaces set pin_rank=p_rank where id=p_id;
  end if;
 else raise exception 'Tipo no válido'; end if;
 perform public.plaza_audit_add(case when p_rank is null then 'Desancló' else 'Ancló en el puesto '||p_rank end,label);
end $$;

create function public.plaza_admin_pins() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador');
begin return jsonb_build_object(
 'news',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'pin_rank',n.pin_rank) order by n.pin_rank),'[]') from public.plaza_news n where n.pin_rank is not null),
 'spaces',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.name,'type',s.type,'pin_rank',s.pin_rank) order by s.type='foro',s.pin_rank),'[]') from public.plaza_spaces s where s.pin_rank is not null));
end $$;

create function public.plaza_guard_target(p_user uuid,p_me text) returns text language plpgsql stable security definer set search_path='' as $$
declare u text;
begin
 select username into u from public.plaza_profiles where id=p_user;
 if u is null then raise exception 'Ese usuario ya no existe'; end if;
 if p_user=auth.uid() then raise exception 'No puedes hacer esto con tu propia cuenta'; end if;
 if public.plaza_rank(public.plaza_staff_role(p_user))>=public.plaza_rank(p_me) then raise exception 'No puedes actuar sobre un perfil igual o superior al tuyo' using errcode='42501'; end if;
 return u;
end $$;

create function public.plaza_admin_suspend(p_user uuid,p_days int,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor'); u text:=public.plaza_guard_target(p_user,r); t timestamptz:=case when p_days is null then null else now()+make_interval(days=>p_days) end;
begin
 if p_days is not null and p_days<1 then raise exception 'Escribe al menos un día'; end if;
 insert into public.plaza_sanctions(user_id,until,reason,created_by) values(p_user,t,left(coalesce(p_reason,''),300),auth.uid())
 on conflict (user_id) do update set until=excluded.until,reason=excluded.reason,created_by=excluded.created_by,created_at=now();
 perform public.plaza_audit_add('Suspendió','@'||u,jsonb_build_object('dias',p_days,'motivo',p_reason));
end $$;
create function public.plaza_admin_unsuspend(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor'); u text:=public.plaza_guard_target(p_user,r);
begin delete from public.plaza_sanctions where user_id=p_user; perform public.plaza_audit_add('Levantó la suspensión','@'||u); end $$;

create function public.plaza_admin_set_role(p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('admin'); u text; o text:=public.plaza_staff_role(p_user);
begin
 select username into u from public.plaza_profiles where id=p_user;
 if u is null then raise exception 'Ese usuario ya no existe'; end if;
 if p_role is not null and p_role not in ('admin','supervisor','moderador') then raise exception 'Perfil no válido'; end if;
 if o='admin' and p_role is distinct from 'admin' and (select count(*) from public.plaza_staff where role='admin')<=1 then raise exception 'Debe quedar al menos un administrador'; end if;
 if p_role is null then delete from public.plaza_staff where user_id=p_user;
 else insert into public.plaza_staff(user_id,role,granted_by) values(p_user,p_role,auth.uid()) on conflict (user_id) do update set role=excluded.role,granted_by=excluded.granted_by; end if;
 perform public.plaza_audit_add('Cambió el perfil','@'||u,jsonb_build_object('antes',o,'ahora',p_role));
end $$;

create function public.plaza_admin_delete_user(p_user uuid,p_confirm text) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('admin'); u text:=public.plaza_guard_target(p_user,r);
begin
 if lower(coalesce(p_confirm,''))<>lower(u) then raise exception 'Escribe el usuario exacto para confirmar'; end if;
 update public.plaza_spaces set owner_id=auth.uid() where id='00000000-0000-0000-0000-00000000f0f0' and owner_id=p_user;
 perform public.plaza_audit_add('Eliminó la cuenta','@'||u);
 delete from auth.users where id=p_user;
end $$;

create function public.plaza_admin_send_alert(p_title text,p_body text,p_level text,p_audience text,p_username text default null,p_hours int default 24) returns uuid language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor'); t uuid; a uuid; h int:=least(greatest(coalesce(p_hours,24),1),168);
begin
 if p_audience='usuario' then
  select id into t from public.plaza_profiles where lower(username)=lower(trim(leading '@' from trim(coalesce(p_username,''))));
  if t is null then raise exception 'No encontramos ese usuario'; end if;
 end if;
 insert into public.plaza_alerts(title,body,level,audience,target_user,expires_at) values(trim(p_title),trim(coalesce(p_body,'')),p_level,p_audience,t,now()+make_interval(hours=>h)) returning id into a;
 perform public.plaza_audit_add('Envió '||case when p_level='alarma' then 'una alarma' else 'un aviso' end,trim(p_title),jsonb_build_object('para',p_audience,'usuario',p_username));
 return a;
end $$;
create function public.plaza_admin_end_alert(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('supervisor'); l text;
begin update public.plaza_alerts set expires_at=now() where id=p_id returning title into l; if l is null then raise exception 'Esa alerta ya no existe'; end if; perform public.plaza_audit_add('Terminó una alerta',l); end $$;
create function public.plaza_admin_alerts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('moderador');
begin return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'level',a.level,'audience',a.audience,'username',p.username,'created_at',a.created_at,'expires_at',a.expires_at,'active',a.expires_at>now()) order by a.created_at desc) from (select * from public.plaza_alerts order by created_at desc limit 100) a left join public.plaza_profiles p on p.id=a.target_user),'[]'); end $$;
create function public.plaza_admin_audit(p_limit int default 200) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('admin');
begin return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.actor_name,a.action,a.target,a.detail,a.created_at from public.plaza_audit a order by a.created_at desc limit least(greatest(p_limit,1),500)) x),'[]'); end $$;

create function public.plaza_push_save(p_endpoint text,p_p256dh text,p_auth text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/' then raise exception 'Suscripción no válida'; end if;
 insert into public.plaza_push_subs(endpoint,p256dh,auth,user_id) values(p_endpoint,p_p256dh,p_auth,auth.uid())
 on conflict (endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,user_id=coalesce(excluded.user_id,public.plaza_push_subs.user_id);
end $$;

-- El equipo puede abrir archivos de espacios privados, nunca los de mensajes privados.
create or replace function public.plaza_storage_read(p text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a text[]:=string_to_array(p,'/');
begin
 if a[1]='pub' then return true; end if;
 if a[1]='priv' then return public.plaza_can_read(a[2]::uuid) or public.plaza_staff_role() is not null; end if;
 if a[1]='dm' then return auth.uid()::text = any(string_to_array(a[2],'_')); end if;
 return false;
exception when others then return false; end $$;

alter publication supabase_realtime add table public.plaza_alerts,public.plaza_spaces;

do $$
declare f record;
begin
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'plaza\_admin\_%' or p.proname in ('plaza_touch','plaza_staff_role','plaza_rank','plaza_need','plaza_is_suspended','plaza_request_ip','plaza_request_agent','plaza_audit_add','plaza_guard','plaza_log_ip','plaza_items','plaza_guard_target','plaza_push_save')) loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
  if f.proname like 'plaza\_admin\_%' or f.proname='plaza_touch' then execute format('grant execute on function %s to authenticated',f.sig); end if;
  if f.proname='plaza_push_save' then execute format('grant execute on function %s to anon,authenticated',f.sig); end if;
 end loop;
end $$;
