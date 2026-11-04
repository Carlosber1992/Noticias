-- Expedientes descargables de un usuario o de una IP. Los mensajes privados solo entran si se piden.
insert into storage.buckets(id,name,public) values('plaza-exports','plaza-exports',false);

create function public.plaza_admin_export(p_type text,p_user uuid,p_ip text,p_dms boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.plaza_need('admin'); res jsonb;
begin
 if p_type='usuario' then
  if not exists(select 1 from public.plaza_profiles where id=p_user) then raise exception 'Ese usuario ya no existe'; end if;
  select jsonb_build_object('type','usuario','generated_at',now(),
   'profile',(select jsonb_build_object('id',p.id,'username',p.username,'created_at',p.created_at,'email',c.email,'phone',c.phone,'last_sign_in_at',a.last_sign_in_at,
      'sanction',(select jsonb_build_object('until',s.until,'reason',s.reason) from public.plaza_sanctions s where s.user_id=p.id))
     from public.plaza_profiles p left join public.plaza_contacts c on c.user_id=p.id left join auth.users a on a.id=p.id where p.id=p_user),
   'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select l.created_at,l.kind,l.ip,l.user_agent from public.plaza_ip_log l where l.user_id=p_user) x),
   'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('ip',(select l.ip from public.plaza_ip_log l where l.ref_id=i.id limit 1)) order by i.created_at desc),'[]') from public.plaza_items() i where i.author_id=p_user),
   'follows',(select coalesce(jsonb_agg(jsonb_build_object('name',s.name,'type',s.type,'created_at',m.created_at)),'[]') from public.plaza_members m join public.plaza_spaces s on s.id=m.space_id where m.user_id=p_user),
   'votes',(select coalesce(jsonb_agg(jsonb_build_object('title',n.title,'value',v.value)),'[]') from public.plaza_news_votes v join public.plaza_news n on n.id=v.news_id where v.user_id=p_user),
   'likes',(select count(*) from public.plaza_likes l where l.user_id=p_user)+(select count(*) from public.plaza_thread_votes t where t.user_id=p_user),
   'removed',(select coalesce(jsonb_agg(jsonb_build_object('created_at',a.created_at,'action',a.action,'detail',a.detail) order by a.created_at desc),'[]') from public.plaza_audit a where a.detail->>'autor'=p_user::text),
   'dms',case when p_dms then (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'created_at',d.created_at,'body',d.body,'media',d.media,'sender',a.username,'recipient',b.username) order by d.created_at desc),'[]') from public.plaza_dms d join public.plaza_profiles a on a.id=d.sender_id join public.plaza_profiles b on b.id=d.recipient_id where p_user in (d.sender_id,d.recipient_id)) end) into res;
  return res;
 end if;
 if p_type='ip' then
  if not exists(select 1 from public.plaza_ip_log l where l.ip=p_ip) then raise exception 'No hay registros de esa IP'; end if;
  select jsonb_build_object('type','ip','ip',p_ip,'generated_at',now(),
   'users',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select p.id,p.username,p.created_at,c.email,c.phone,count(*)::int events,min(l.created_at) first_seen,max(l.created_at) last_seen from public.plaza_ip_log l join public.plaza_profiles p on p.id=l.user_id left join public.plaza_contacts c on c.user_id=p.id where l.ip=p_ip group by p.id,p.username,p.created_at,c.email,c.phone order by 6 desc) x),
   'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select l.created_at,l.kind,l.ref_id,l.user_agent,p.username from public.plaza_ip_log l join public.plaza_profiles p on p.id=l.user_id where l.ip=p_ip) x),
   'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('ip',p_ip,'username',p.username) order by i.created_at desc),'[]') from public.plaza_items() i join public.plaza_profiles p on p.id=i.author_id where exists(select 1 from public.plaza_ip_log l where l.ip=p_ip and l.ref_id=i.id)),
   'dms',case when p_dms then (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'created_at',d.created_at,'body',d.body,'media',d.media,'sender',a.username,'recipient',b.username) order by d.created_at desc),'[]') from public.plaza_dms d join public.plaza_profiles a on a.id=d.sender_id join public.plaza_profiles b on b.id=d.recipient_id where exists(select 1 from public.plaza_ip_log l where l.ip=p_ip and l.kind='privado' and l.ref_id=d.id)) end) into res;
  return res;
 end if;
 raise exception 'Tipo no válido';
end $$;
revoke execute on function public.plaza_admin_export(text,uuid,text,boolean) from public,anon,authenticated;

do $$
declare d text;
begin
 d:=pg_get_functiondef('public.plaza_panel(text,jsonb)'::regprocedure);
 d:=replace(d,E'  else raise exception ''Acción no válida'';',
$x$  when 'exportar' then
   return jsonb_build_object('request',net.http_post(url:='https://qbcabwbpobqgwblrzhzb.supabase.co/functions/v1/plaza-export',
    body:=jsonb_build_object('secret',(select value from public.plaza_panel_secret where id=1),'dossier',public.plaza_admin_export(p_a->>'type',u,p_a->>'ip',coalesce((p_a->>'dms')::boolean,false))),
    headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=140000));
  when 'exportar_estado' then
   return coalesce((select jsonb_build_object('ready',true,'status',r.status_code,'error',coalesce(r.error_msg,case when r.timed_out then 'Tardó demasiado' end),'result',case when r.content like '{%' then r.content::jsonb end) from net._http_response r where r.id=(p_a->>'request')::bigint),'{"ready":false}'::jsonb);
  else raise exception 'Acción no válida';$x$);
 execute d;
end $$;
