alter table public.plaza_threads add column lat double precision, add column lng double precision, add column place text check (char_length(place)<=80);
create or replace function public.plaza_create_space(p_type text,p_name text,p_description text,p_private boolean,p_lat double precision,p_lng double precision,p_place text,p_question text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; t uuid; me uuid:=auth.uid();
begin
 if me is null then raise exception 'Necesitas una cuenta'; end if;
 if p_type='foro' and coalesce(trim(p_question),'')='' then raise exception 'Escribe la primera pregunta'; end if;
 if p_type<>'foro' and (p_lat is null or p_lng is null) then raise exception 'Elige la ubicación'; end if;
 insert into public.plaza_spaces(type,name,is_private,owner_id,lat,lng,place) values(p_type,trim(p_name),p_private,me,p_lat,p_lng,p_place) returning id into s;
 insert into public.plaza_space_details values(s,coalesce(p_description,''));
 insert into public.plaza_members(space_id,user_id) values(s,me);
 if p_type='foro' then insert into public.plaza_threads(space_id,author_id,title) values(s,me,trim(p_question)) returning id into t; end if;
 return jsonb_build_object('space_id',s,'thread_id',t);
end $$;
