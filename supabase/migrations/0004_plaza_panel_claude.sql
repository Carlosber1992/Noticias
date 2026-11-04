-- El panel vive en Claude y llega por el conector de Supabase, que entra como dueño del proyecto.
-- plaza_panel es su única puerta: fija qué cuenta del equipo actúa y las reglas de cada perfil
-- se aplican igual. No se puede llamar desde la app.
create extension if not exists pg_net;
create table public.plaza_panel_secret(id int primary key default 1 check (id=1),value text not null);
alter table public.plaza_panel_secret enable row level security;
insert into public.plaza_panel_secret(value) values(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));

create function public.plaza_alert_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin
  perform net.http_post(url:='https://qbcabwbpobqgwblrzhzb.supabase.co/functions/v1/plaza-alert',
   body:=jsonb_build_object('id',new.id,'secret',(select value from public.plaza_panel_secret where id=1)),
   headers:='{"Content-Type":"application/json"}'::jsonb);
 exception when others then null; end;
 return null;
end $$;
create trigger plaza_push after insert on public.plaza_alerts for each row execute function public.plaza_alert_push();

create function public.plaza_panel(p_actor uuid,p_fn text,p_a jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=nullif(p_a->>'user','')::uuid; i uuid:=nullif(p_a->>'id','')::uuid;
begin
 if p_fn='equipo' then
  return jsonb_build_object('staff',(select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'username',p.username,'role',s.role) order by public.plaza_rank(s.role) desc,p.username),'[]') from public.plaza_staff s join public.plaza_profiles p on p.id=s.user_id),
   'cuentas',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username) order by p.created_at),'[]') from public.plaza_profiles p where not exists(select 1 from public.plaza_staff)));
 end if;
 if p_fn='primer_admin' then
  if exists(select 1 from public.plaza_staff) then raise exception 'Ya hay un administrador'; end if;
  insert into public.plaza_staff(user_id,role) values(u,'admin');
  return jsonb_build_object('ok',true);
 end if;
 if public.plaza_staff_role(p_actor) is null then raise exception 'Esa cuenta no pertenece al equipo'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 case p_fn
  when 'resumen' then return public.plaza_admin_stats();
  when 'usuarios' then return public.plaza_admin_users(coalesce(p_a->>'q',''),nullif(p_a->>'ip',''),coalesce(p_a->>'filter','todos'),coalesce((p_a->>'limit')::int,50),coalesce((p_a->>'offset')::int,0));
  when 'usuario' then return public.plaza_admin_user(u);
  when 'contenido' then return public.plaza_admin_content(coalesce(p_a->>'kind','todos'),coalesce(p_a->>'q',''),coalesce(p_a->>'author',''),nullif(p_a->>'ip',''),coalesce(p_a->>'tipo','todos'),coalesce(p_a->>'municipio',''),nullif(p_a->>'from','')::timestamptz,nullif(p_a->>'to','')::timestamptz,coalesce((p_a->>'limit')::int,50),coalesce((p_a->>'offset')::int,0));
  when 'ips' then return public.plaza_admin_ips(coalesce(p_a->>'q',''),coalesce((p_a->>'min_users')::int,1));
  when 'anclados' then return public.plaza_admin_pins();
  when 'alertas' then return public.plaza_admin_alerts();
  when 'registro' then return public.plaza_admin_audit();
  when 'eliminar' then perform public.plaza_admin_delete(p_a->>'kind',i,coalesce(p_a->>'reason',''));
  when 'anclar' then perform public.plaza_admin_pin(p_a->>'kind',i,(p_a->>'rank')::int);
  when 'suspender' then perform public.plaza_admin_suspend(u,(p_a->>'days')::int,coalesce(p_a->>'reason',''));
  when 'reactivar' then perform public.plaza_admin_unsuspend(u);
  when 'perfil' then perform public.plaza_admin_set_role(u,nullif(p_a->>'role',''));
  when 'eliminar_cuenta' then perform public.plaza_admin_delete_user(u,p_a->>'confirm');
  when 'enviar_alerta' then perform public.plaza_admin_send_alert(p_a->>'title',p_a->>'body',p_a->>'level',p_a->>'audience',p_a->>'username',(p_a->>'hours')::int);
  when 'terminar_alerta' then perform public.plaza_admin_end_alert(i);
  else raise exception 'Acción no válida';
 end case;
 return jsonb_build_object('ok',true);
end $$;
revoke execute on function public.plaza_panel(uuid,text,jsonb),public.plaza_alert_push() from public,anon,authenticated;
