alter table public.plaza_members add column last_read_at timestamptz not null default now();
create function public.plaza_space_stats() returns table(space_id uuid,total int,unread int) language sql stable security definer set search_path='' as $$
 select s.id,count(m.id)::int,
  case when me.user_id is null then null else (count(m.id) filter (where m.created_at>me.last_read_at and m.author_id<>auth.uid()))::int end
 from public.plaza_spaces s
 left join public.plaza_members me on me.space_id=s.id and me.user_id=auth.uid()
 left join public.plaza_messages m on m.space_id=s.id and m.thread_id is null
 where s.type<>'foro' and public.plaza_can_read(s.id)
 group by s.id,me.user_id,me.last_read_at $$;
create function public.plaza_mark_space_read(p_space uuid) returns void language sql security definer set search_path='' as
$$ update public.plaza_members set last_read_at=now() where space_id=p_space and user_id=auth.uid() $$;
revoke execute on function public.plaza_mark_space_read(uuid) from public,anon;
grant execute on function public.plaza_mark_space_read(uuid) to authenticated;
