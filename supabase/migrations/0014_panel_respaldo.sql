-- El panel muestra también el correo y el celular de respaldo (plaza_recovery).
do $$
declare f text; d text; o text;
 a text:='left join public.plaza_contacts c on c.user_id=p.id';
 b text:='left join lateral (select coalesce(r0.email,c0.email) email,coalesce(r0.phone,c0.phone) phone from (select 1) o0 left join public.plaza_contacts c0 on c0.user_id=p.id left join public.plaza_recovery r0 on r0.user_id=p.id) c on true';
begin
 foreach f in array array['public.plaza_admin_users(text,text,text,integer,integer)','public.plaza_admin_user(uuid)','public.plaza_admin_export(text,uuid,text,boolean)'] loop
  d:=pg_get_functiondef(f::regprocedure); o:=d; d:=replace(d,a,b);
  if d=o then raise exception 'sin cambio en %',f; end if;
  execute d;
 end loop;
end $$;
