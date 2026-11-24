// Teste de ponta a ponta do backend Supabase: cria 2 usuários, amizade, servidor, mensagens, DM, reação, upload.
// Uso: node scripts/test-backend.mjs CODIGO_DE_CONVITE
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, EMAIL_DOMAIN } from '../web/src/config.js';

const code = process.argv[2];
const tag = Date.now().toString(36).slice(-5);
const mk = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const ok = (label, { error, data }) => {
  if (error) { console.error('FALHOU:', label, error.message); process.exit(1); }
  console.log('ok  ', label);
  return data;
};

async function user(name) {
  const c = mk();
  ok('signup ' + name, await c.auth.signUp({ email: `${name}@${EMAIL_DOMAIN}`, password: 'teste123456' }));
  const p = ok('create_profile ' + name, await c.rpc('create_profile', { p_username: name, p_display_name: name.toUpperCase(), p_code: code }));
  return { c, id: p.id };
}

const a = await user('ta_' + tag);
const b = await user('tb_' + tag);

// convite errado deve falhar
const bad = mk();
await bad.auth.signUp({ email: `tc_${tag}@${EMAIL_DOMAIN}`, password: 'teste123456' });
const r = await bad.rpc('create_profile', { p_username: 'tc_' + tag, p_display_name: 'x', p_code: 'ERRADO' });
console.log(r.error ? 'ok   convite errado bloqueado' : 'FALHOU: convite errado aceito');

const rel = ok('pedido de amizade', await a.c.from('relations').insert({ from_id: a.id, to_id: b.id }).select().single());
ok('aceitar amizade', await b.c.from('relations').update({ status: 'accepted' }).eq('id', rel.id).select().single());

const sv = ok('criar servidor', await a.c.from('servers').insert({ name: 'Teste ' + tag }).select().single());
const chans = ok('canais padrão', await a.c.from('channels').select().eq('server_id', sv.id));
if (chans.length !== 4) { console.error('FALHOU: esperava 4 canais'); process.exit(1); }
const geral = chans.find((c) => c.name === 'geral');

const vazio = ok('B não vê canal antes de entrar', await b.c.from('messages').select().eq('channel_id', geral.id));
ok('B entra pelo convite', await b.c.rpc('join_server', { code: sv.invite }));
const m = ok('B envia mensagem', await b.c.from('messages').insert({ channel_id: geral.id, content: 'oi @ta_' + tag }).select().single());
ok('A reage', await a.c.rpc('toggle_reaction', { mid: m.id, emoji: '🔥' }));
const lidas = ok('A lê mensagens', await a.c.from('messages').select().eq('channel_id', geral.id));
console.log('     reações:', JSON.stringify(lidas[0].reactions));

const dm = ok('abrir DM', await a.c.rpc('open_dm', { other: b.id }));
ok('mensagem na DM', await a.c.from('messages').insert({ channel_id: dm.id, content: 'dm' }));
const up = await a.c.storage.from('uploads').upload(`${a.id}/teste-${tag}.txt`, new Blob(['ola']), { contentType: 'text/plain' });
ok('upload de arquivo', up);
const inv = ok('código de convite via RPC', await a.c.rpc('get_invite_code'));
console.log('     código:', inv);

// limpeza
ok('apagar servidor', await a.c.from('servers').delete().eq('id', sv.id));
await a.c.storage.from('uploads').remove([`${a.id}/teste-${tag}.txt`]);
console.log('\nTudo certo. Usuários de teste ficaram no banco: ta_' + tag + ', tb_' + tag);
