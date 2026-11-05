-- Las ubicaciones públicas se guardan aproximadas (cerca de 1 km) para no revelar el punto exacto.
create function public.plaza_round_loc() returns trigger language plpgsql set search_path='' as $$
begin
 new.lat:=round(new.lat::numeric,2)::double precision;
 new.lng:=round(new.lng::numeric,2)::double precision;
 return new;
end $$;
revoke execute on function public.plaza_round_loc() from public,anon,authenticated;
create trigger plaza_round before insert or update of lat,lng on public.plaza_news for each row execute function public.plaza_round_loc();
create trigger plaza_round before insert or update of lat,lng on public.plaza_threads for each row execute function public.plaza_round_loc();
create trigger plaza_round before insert or update of lat,lng on public.plaza_messages for each row execute function public.plaza_round_loc();
create trigger plaza_round before insert or update of lat,lng on public.plaza_spaces for each row execute function public.plaza_round_loc();
alter table public.plaza_news drop constraint plaza_news_municipio_check;
alter table public.plaza_news add constraint plaza_news_municipio_check check (char_length(municipio) between 2 and 120);
