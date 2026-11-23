-- La IP del nuevo diseño ya la registra la migración yasupo_panel (triggers ys_guard e ys_ip).

-- 2) Correo y celular de respaldo (opcionales, privados: solo los ve su dueño).
create table public.plaza_recovery (
  user_id uuid primary key default auth.uid() references public.plaza_profiles(id) on delete cascade,
  email text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.plaza_recovery enable row level security;
create policy plaza_recovery_own_read on public.plaza_recovery for select to authenticated using (user_id = auth.uid());
create policy plaza_recovery_own_delete on public.plaza_recovery for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.plaza_recovery to authenticated;

-- Guarda (o borra, si llegan vacíos) el correo y el celular de quien está conectado.
create or replace function public.plaza_recovery_save(p_email text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := auth.uid(); r public.plaza_recovery;
begin
  if a is null then raise exception 'Necesitas entrar a tu cuenta'; end if;
  if nullif(trim(p_email), '') is null and nullif(trim(p_phone), '') is null then
    delete from public.plaza_recovery where user_id = a;
    return null;
  end if;
  insert into public.plaza_recovery(user_id, email, phone) values (a, p_email, p_phone)
  on conflict (user_id) do update set email = excluded.email, phone = excluded.phone
  returning * into r;
  begin
    insert into public.plaza_ip_log(user_id, ip, kind, user_agent)
    select a, i, 'respaldo', public.plaza_request_agent() from (select public.plaza_request_ip() i) x where x.i is not null;
  exception when others then null; end;
  return jsonb_build_object('email', r.email, 'phone', r.phone, 'email_verified_at', r.email_verified_at, 'phone_verified_at', r.phone_verified_at);
end $$;
revoke execute on function public.plaza_recovery_save(text, text) from public, anon;
grant execute on function public.plaza_recovery_save(text, text) to authenticated;

-- Si cambia el correo o el celular, hay que volver a verificarlo.
create or replace function public.plaza_recovery_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.phone := nullif(trim(new.phone), '');
  if tg_op = 'INSERT' then new.email_verified_at := null; new.phone_verified_at := null;
  else
    if new.email is distinct from old.email then new.email_verified_at := null; end if;
    if new.phone is distinct from old.phone then new.phone_verified_at := null; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger plaza_recovery_touch before insert or update on public.plaza_recovery for each row execute function public.plaza_recovery_touch();

-- Códigos de un solo uso (solo los maneja la función del servidor).
create table public.plaza_recovery_codes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.plaza_profiles(id) on delete cascade,
  purpose text not null check (purpose in ('reset', 'verify_email', 'verify_phone')),
  channel text not null check (channel in ('email', 'phone')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.plaza_recovery_codes(user_id, created_at desc);
alter table public.plaza_recovery_codes enable row level security;
