-- Registro de chamadas no chat (mensagens do tipo "call").
-- Já incluído em schema.sql; este arquivo existe para aplicar só esta parte.
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

select 'ok' as chamadas;
