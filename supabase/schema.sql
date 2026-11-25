-- =====================================================================
-- Perfumolandia — esquema do banco (Supabase)
-- Rode inteiro no SQL Editor do projeto. Pode rodar de novo sem quebrar.
-- =====================================================================

-- ---------- código de convite foi removido (cadastro livre) ----------
drop function if exists public.create_profile(text, text, text);
drop function if exists public.check_invite(text);
drop function if exists public.get_invite_code();
drop table if exists public.app_config;

-- ---------- perfis ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_url text,
  color text not null default '#7c5cff',
  status text not null default 'online' check (status in ('online', 'idle', 'dnd', 'invisible')),
  custom_status text not null default '' check (char_length(custom_status) <= 80),
  bio text not null default '' check (char_length(bio) <= 190),
  created_at timestamptz not null default now()
);
-- personalização do perfil
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists accent_color text;
alter table public.profiles add column if not exists pronouns text not null default '';
alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles add constraint profiles_bio_check check (char_length(bio) <= 400);
alter table public.profiles drop constraint if exists profiles_pronouns_check;
alter table public.profiles add constraint profiles_pronouns_check check (char_length(pronouns) <= 40);
-- loja: moldura do avatar, efeito do perfil e itens resgatados
alter table public.profiles add column if not exists decoration text;
alter table public.profiles add column if not exists profile_effect text;
alter table public.profiles add column if not exists items text[] not null default '{}';
alter table public.profiles add column if not exists profile_frame text;
alter table public.profiles add column if not exists nameplate text;
alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.create_profile(p_username text, p_display_name text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  r profiles;
  colors text[] := array['#7c5cff','#ff5c8a','#2dd4bf','#f59e0b','#38bdf8','#a3e635','#f472b6','#fb7185'];
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select * into r from profiles where id = auth.uid();
  if found then return r; end if;
  insert into profiles (id, username, display_name, color)
  values (auth.uid(), lower(trim(p_username)),
          coalesce(nullif(trim(p_display_name), ''), lower(trim(p_username))),
          colors[1 + floor(random() * 8)::int])
  returning * into r;
  return r;
end $$;
grant execute on function public.create_profile(text, text) to authenticated;

-- ---------- amizades ----------
create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create unique index if not exists relations_pair on public.relations (least(from_id, to_id), greatest(from_id, to_id));
alter table public.relations enable row level security;
drop policy if exists "rel read" on public.relations;
create policy "rel read" on public.relations for select to authenticated using (auth.uid() in (from_id, to_id));
drop policy if exists "rel insert" on public.relations;
create policy "rel insert" on public.relations for insert to authenticated with check (from_id = auth.uid() and status = 'pending');
drop policy if exists "rel accept" on public.relations;
create policy "rel accept" on public.relations for update to authenticated
  using (to_id = auth.uid()) with check (to_id = auth.uid() and status = 'accepted');
drop policy if exists "rel delete" on public.relations;
create policy "rel delete" on public.relations for delete to authenticated using (auth.uid() in (from_id, to_id));

-- ---------- servidores e canais ----------
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 48),
  icon_url text,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  invite text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_at timestamptz not null default now()
);
create table if not exists public.server_members (
  server_id uuid not null references public.servers on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text not null check (type in ('text', 'voice')),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channels_server on public.channels (server_id);
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;

create or replace function public.is_server_member(sid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from server_members where server_id = sid and user_id = auth.uid());
$$;

drop policy if exists "servers read" on public.servers;
create policy "servers read" on public.servers for select to authenticated using (owner_id = auth.uid() or is_server_member(id));
drop policy if exists "servers insert" on public.servers;
create policy "servers insert" on public.servers for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "servers update" on public.servers;
create policy "servers update" on public.servers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "servers delete" on public.servers;
create policy "servers delete" on public.servers for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read" on public.server_members;
create policy "members read" on public.server_members for select to authenticated using (is_server_member(server_id));
drop policy if exists "members leave or kick" on public.server_members;
create policy "members leave or kick" on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and not exists (select 1 from servers s where s.id = server_id and s.owner_id = auth.uid()))
  or exists (select 1 from servers s where s.id = server_id and s.owner_id = auth.uid() and user_id <> auth.uid())
);

drop policy if exists "channels read" on public.channels;
create policy "channels read" on public.channels for select to authenticated using (is_server_member(server_id));
drop policy if exists "channels insert" on public.channels;
create policy "channels insert" on public.channels for insert to authenticated with check (is_server_member(server_id));
drop policy if exists "channels update" on public.channels;
create policy "channels update" on public.channels for update to authenticated using (is_server_member(server_id)) with check (is_server_member(server_id));
drop policy if exists "channels delete" on public.channels;
create policy "channels delete" on public.channels for delete to authenticated using (is_server_member(server_id));

-- ao criar servidor: dono vira membro + canais padrão
create or replace function public.on_server_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into server_members (server_id, user_id) values (new.id, new.owner_id) on conflict do nothing;
  insert into channels (server_id, name, type, position) values
    (new.id, 'geral', 'text', 0),
    (new.id, 'clipes-e-prints', 'text', 1),
    (new.id, 'Resenha', 'voice', 2),
    (new.id, 'Jogando', 'voice', 3);
  return new;
end $$;
drop trigger if exists server_created on public.servers;
create trigger server_created after insert on public.servers for each row execute function public.on_server_created();

create or replace function public.join_server(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Perfil não encontrado.'; end if;
  select id into sid from servers where invite = upper(trim(regexp_replace(code, '^.*/', '')));
  if sid is null then raise exception 'Convite inválido ou expirado.'; end if;
  insert into server_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;
grant execute on function public.join_server(text) to authenticated;

-- ---------- conversas diretas ----------
create table if not exists public.dms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
alter table public.dms enable row level security;
drop policy if exists "dms read" on public.dms;
create policy "dms read" on public.dms for select to authenticated using (auth.uid() in (user_a, user_b));

create or replace function public.open_dm(other uuid) returns public.dms
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid := least(me, other);
  b uuid := greatest(me, other);
  r dms;
begin
  if me is null or other is null or me = other then raise exception 'Usuário inválido.'; end if;
  if not exists (select 1 from relations where status = 'accepted' and least(from_id, to_id) = a and greatest(from_id, to_id) = b)
     and not exists (select 1 from server_members m1 join server_members m2 on m1.server_id = m2.server_id where m1.user_id = me and m2.user_id = other)
  then raise exception 'Vocês precisam ser amigos.'; end if;
  insert into dms (user_a, user_b) values (a, b) on conflict (user_a, user_b) do nothing;
  select * into r from dms where user_a = a and user_b = b;
  return r;
end $$;
grant execute on function public.open_dm(uuid) to authenticated;

-- ---------- grupos (conversa com várias pessoas, sem servidor) ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (char_length(name) <= 48),
  icon_url text,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

drop policy if exists "groups read" on public.groups;
create policy "groups read" on public.groups for select to authenticated using (is_group_member(id));
drop policy if exists "groups update" on public.groups;
create policy "groups update" on public.groups for update to authenticated using (is_group_member(id)) with check (is_group_member(id));
drop policy if exists "groups delete" on public.groups;
create policy "groups delete" on public.groups for delete to authenticated using (owner_id = auth.uid());
drop policy if exists "gm read" on public.group_members;
create policy "gm read" on public.group_members for select to authenticated using (is_group_member(group_id));
drop policy if exists "gm leave or kick" on public.group_members;
create policy "gm leave or kick" on public.group_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid())
);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from relations where status = 'accepted' and least(from_id, to_id) = least(a, b) and greatest(from_id, to_id) = greatest(a, b));
$$;

create or replace function public.create_group(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; m uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if coalesce(array_length(p_members, 1), 0) < 1 then raise exception 'Escolha pelo menos um amigo.'; end if;
  if array_length(p_members, 1) > 24 then raise exception 'Máximo de 25 pessoas no grupo.'; end if;
  foreach m in array p_members loop
    if m <> auth.uid() and not are_friends(auth.uid(), m) then raise exception 'Só dá para adicionar amigos.'; end if;
  end loop;
  insert into groups (name, owner_id) values (coalesce(trim(p_name), ''), auth.uid()) returning id into gid;
  insert into group_members (group_id, user_id) values (gid, auth.uid());
  foreach m in array p_members loop
    insert into group_members (group_id, user_id) values (gid, m) on conflict do nothing;
  end loop;
  return gid;
end $$;
grant execute on function public.create_group(text, uuid[]) to authenticated;

create or replace function public.add_group_members(gid uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not is_group_member(gid) then raise exception 'Você não está nesse grupo.'; end if;
  if (select count(*) from group_members where group_id = gid) + array_length(p_members, 1) > 25 then raise exception 'Máximo de 25 pessoas no grupo.'; end if;
  foreach m in array p_members loop
    if not are_friends(auth.uid(), m) then raise exception 'Só dá para adicionar amigos.'; end if;
    insert into group_members (group_id, user_id) values (gid, m) on conflict do nothing;
  end loop;
end $$;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- ---------- mensagens ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  content text not null default '' check (char_length(content) <= 4000),
  attachments jsonb not null default '[]'::jsonb,
  reply_to uuid,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists messages_channel_time on public.messages (channel_id, created_at desc);
alter table public.messages enable row level security;

create or replace function public.can_access(cid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from channels c join server_members m on m.server_id = c.server_id
                 where c.id = cid and m.user_id = auth.uid())
      or exists (select 1 from dms where id = cid and auth.uid() in (user_a, user_b))
      or exists (select 1 from group_members where group_id = cid and user_id = auth.uid());
$$;
grant execute on function public.can_access(uuid) to authenticated;

drop policy if exists "msg read" on public.messages;
create policy "msg read" on public.messages for select to authenticated using (can_access(channel_id));
drop policy if exists "msg insert" on public.messages;
create policy "msg insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and can_access(channel_id) and reactions = '{}'::jsonb);
drop policy if exists "msg edit" on public.messages;
create policy "msg edit" on public.messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "msg delete" on public.messages;
create policy "msg delete" on public.messages for delete to authenticated using (
  author_id = auth.uid()
  or exists (select 1 from channels c join servers s on s.id = c.server_id where c.id = channel_id and s.owner_id = auth.uid())
);

create or replace function public.toggle_reaction(mid uuid, emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m messages;
  list jsonb;
  me text := auth.uid()::text;
begin
  select * into m from messages where id = mid for update;
  if not found or not can_access(m.channel_id) then raise exception 'Sem acesso.'; end if;
  if char_length(emoji) = 0 or char_length(emoji) > 16 then raise exception 'Emoji inválido.'; end if;
  list := coalesce(m.reactions -> emoji, '[]'::jsonb);
  if list ? me then
    list := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(list) x where x <> me);
  else
    list := list || to_jsonb(me);
  end if;
  if jsonb_array_length(list) = 0 then
    update messages set reactions = reactions - emoji where id = mid;
  else
    update messages set reactions = jsonb_set(reactions, array[emoji], list) where id = mid;
  end if;
end $$;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- última mensagem de cada sala que o usuário vê (para marcar não lidas)
-- inclui a data da última mensagem: a lista de conversas já abre na ordem certa
drop function if exists public.last_messages();
create or replace function public.last_messages() returns table (channel_id uuid, message_id uuid, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  with rooms as (
    select c.id from channels c join server_members sm on sm.server_id = c.server_id and sm.user_id = auth.uid()
    union
    select d.id from dms d where auth.uid() in (d.user_a, d.user_b)
    union
    select gm.group_id from group_members gm where gm.user_id = auth.uid()
  )
  select r.id, lm.id, lm.created_at
  from rooms r
  left join lateral (select m.id, m.created_at from messages m where m.channel_id = r.id order by m.created_at desc limit 1) lm on true;
$$;
grant execute on function public.last_messages() to authenticated;

-- apaga mensagens de canais/DMs removidos
create or replace function public.on_room_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from messages where channel_id = old.id;
  return old;
end $$;
drop trigger if exists channel_deleted on public.channels;
create trigger channel_deleted after delete on public.channels for each row execute function public.on_room_deleted();
drop trigger if exists dm_deleted on public.dms;
create trigger dm_deleted after delete on public.dms for each row execute function public.on_room_deleted();
drop trigger if exists group_deleted on public.groups;
create trigger group_deleted after delete on public.groups for each row execute function public.on_room_deleted();

-- ---------- tempo real ----------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'relations', 'servers', 'server_members', 'channels', 'dms', 'messages', 'groups', 'group_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- arquivos ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "uploads insert own" on storage.objects;
create policy "uploads insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "uploads delete own" on storage.objects;
create policy "uploads delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- conferência
select (select count(*) from public.profiles) as perfis, (select count(*) from public.groups) as grupos;

-- ---------- registro de chamadas ----------
alter table public.messages add column if not exists type text not null default 'text';
alter table public.messages add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check check (type in ('text', 'call'));

-- qualquer participante da conversa atualiza o status da chamada (só avança, nunca volta)
create or replace function public.set_call_status(mid uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m messages;
  cur text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into m from messages where id = mid for update;
  if not found or m.type <> 'call' or not can_access(m.channel_id) then raise exception 'Sem acesso.'; end if;
  if p_status not in ('answered', 'missed', 'declined', 'ended') then raise exception 'Status inválido.'; end if;
  cur := coalesce(m.meta ->> 'status', 'ringing');
  if cur in ('ended', 'missed', 'declined') then return; end if;
  if p_status in ('missed', 'declined') and cur <> 'ringing' then return; end if;
  if p_status = 'answered' and cur <> 'ringing' then return; end if;
  update messages set meta = meta || jsonb_build_object('status', p_status)
    || case when p_status = 'answered' then jsonb_build_object('answeredAt', now_ms, 'answeredBy', auth.uid())
            when p_status = 'ended' then jsonb_build_object('endedAt', now_ms)
            when p_status = 'declined' then jsonb_build_object('declinedBy', auth.uid())
            else '{}'::jsonb end
  where id = mid;
end $$;
grant execute on function public.set_call_status(uuid, text) to authenticated;
