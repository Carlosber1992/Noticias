-- El panel solo entra por plaza_panel: las funciones plaza_admin_* ya no se exponen a la API.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'plaza\_admin\_%' loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
 end loop;
end $$;
