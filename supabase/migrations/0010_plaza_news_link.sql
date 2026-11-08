alter table public.plaza_news add column link text check (link is null or (link ~* '^https?://[^\s]+$' and char_length(link)<=500));
grant update(link) on public.plaza_news to authenticated;
drop trigger plaza_edited on public.plaza_news;
create trigger plaza_edited before update of title,body,municipio,is_breaking,lat,lng,place,link on public.plaza_news for each row execute function public.plaza_edited();
