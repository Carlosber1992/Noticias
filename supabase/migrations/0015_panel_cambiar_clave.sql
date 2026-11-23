-- El administrador puede poner una contraseña nueva a una cuenta. La anterior no se puede leer:
-- Supabase solo guarda su huella cifrada. Al cambiarla se cierran las sesiones abiertas de esa cuenta.
create function public.plaza_admin_set_password(p_user uuid,p_password text) returns void language plpgsql security definer set search_path='' as $$
declare r text:=public.plaza_need('admin'); u text;
begin
 select username into u from public.plaza_profiles where id=p_user;
 if u is null then raise exception 'Ese usuario ya no existe'; end if;
 if p_password is null or char_length(p_password)<8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
 if char_length(p_password)>72 then raise exception 'La contraseña puede tener máximo 72 caracteres'; end if;
 update auth.users set encrypted_password=extensions.crypt(p_password,extensions.gen_salt('bf',10)),updated_at=now() where id=p_user;
 delete from auth.refresh_tokens where user_id::text=p_user::text;
 delete from auth.sessions where user_id=p_user;
 perform public.plaza_audit_add('Cambió la contraseña','@'||u,'{"sesiones_cerradas":true}'::jsonb);
end $$;
revoke execute on function public.plaza_admin_set_password(uuid,text) from public,anon,authenticated;
-- plaza_panel: nueva acción 'cambiar_clave' que llama a plaza_admin_set_password(u, p_a->>'password').
